import argparse
import csv
import hashlib
import json
from collections import defaultdict
from pathlib import Path

import torch
from torch.nn import functional as F
from torch.utils.data import DataLoader, Dataset

from model import PREPROCESS, TRAIN_TRANSFORM, build_model, load_photo


class CivicImages(Dataset):
    def __init__(self, rows, transform):
        self.rows = rows
        self.transform = transform

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, index):
        path, label, category = self.rows[index]
        return self.transform(load_photo(path)), label, category


def read_manifest(path):
    splits = defaultdict(list)
    group_splits = {}
    hashes = set()
    with path.open(encoding="utf-8-sig", newline="") as source:
        for row in csv.DictReader(source):
            split, group, category = (row[key].strip() for key in ("split", "group", "category"))
            label = {"real": 0, "ai": 1}[row["origin"]]
            if split not in {"train", "val", "test"} or not group or not category:
                raise ValueError("Each row needs a valid split, category and source group")
            if group_splits.setdefault(group, split) != split:
                raise ValueError(f"Source group crosses splits: {group}")
            image = path.parent / row["path"]
            digest = hashlib.sha256(image.read_bytes()).digest()
            if digest in hashes:
                raise ValueError(f"Duplicate image: {image}")
            hashes.add(digest)
            splits[split].append((image, label, category))

    categories = {category for rows in splits.values() for _, _, category in rows}
    if not {"ROAD_DAMAGE", "WATER_LEAKAGE"} <= categories or len(categories) < 3:
        raise ValueError("Include roads, water leakage, and at least one other civic issue")
    for split in ("train", "val", "test"):
        if {(category, label) for _, label, category in splits[split]} != {
            (category, label) for category in categories for label in (0, 1)
        }:
            raise ValueError(f"Each category needs both origins in {split}")
    return splits


@torch.inference_mode()
def predict(model, loader, device):
    model.eval()
    logits, labels, categories = [], [], []
    for photos, targets, batch_categories in loader:
        logits.append(model(photos.to(device)).cpu())
        labels.append(targets)
        categories.extend(batch_categories)
    return torch.cat(logits), torch.cat(labels), categories


def calibrate(logits, targets):
    log_temperature = torch.zeros((), requires_grad=True)
    optimizer = torch.optim.LBFGS([log_temperature], max_iter=40, line_search_fn="strong_wolfe")

    def loss():
        optimizer.zero_grad()
        value = F.cross_entropy(logits / log_temperature.clamp(-4, 4).exp(), targets)
        value.backward()
        return value

    optimizer.step(loss)
    return float(log_temperature.detach().clamp(-4, 4).exp())


def metrics(probabilities, targets):
    predicted = probabilities > 0.5
    real = targets == 0
    fake = targets == 1
    return {
        "realCount": int(real.sum()),
        "aiCount": int(fake.sum()),
        "realFalseRejectionRate": float(predicted[real].float().mean()),
        "aiDetectionRate": float(predicted[fake].float().mean()),
        "brierScore": float((probabilities - targets).square().mean()),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--epochs", type=int, default=10)
    parser.add_argument("--batch-size", type=int, default=32)
    args = parser.parse_args()
    if args.epochs < 1 or args.batch_size < 1:
        parser.error("epochs and batch size must be positive")

    torch.manual_seed(17)
    splits = read_manifest(args.manifest)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    loaders = {
        split: DataLoader(
            CivicImages(rows, TRAIN_TRANSFORM if split == "train" else PREPROCESS),
            batch_size=args.batch_size,
            shuffle=split == "train",
        )
        for split, rows in splits.items()
    }
    model = build_model(pretrained=True).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=0.0003)
    best_loss = float("inf")
    for epoch in range(args.epochs):
        model.train()
        for photos, targets, _ in loaders["train"]:
            optimizer.zero_grad()
            loss = F.cross_entropy(model(photos.to(device)), targets.to(device))
            loss.backward()
            optimizer.step()
        logits, targets, _ = predict(model, loaders["val"], device)
        validation_loss = float(F.cross_entropy(logits, targets))
        print(f"Epoch {epoch + 1}: validation loss {validation_loss:.4f}", flush=True)
        if validation_loss < best_loss:
            best_loss = validation_loss
            best_weights = {key: value.detach().cpu().clone() for key, value in model.state_dict().items()}

    model.load_state_dict(best_weights)
    validation_logits, validation_targets, _ = predict(model, loaders["val"], device)
    temperature = calibrate(validation_logits.clone(), validation_targets.clone())
    logits, targets, categories = predict(model, loaders["test"], device)
    scores = (logits / temperature).softmax(dim=1)[:, 1]
    report = {"overall": metrics(scores, targets), "byCategory": {}}
    for category in sorted(set(categories)):
        mask = torch.tensor([value == category for value in categories])
        report["byCategory"][category] = metrics(scores[mask], targets[mask])
    args.output.parent.mkdir(parents=True, exist_ok=True)
    torch.save({"weights": best_weights, "temperature": temperature}, args.output)
    args.output.with_suffix(".metrics.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
