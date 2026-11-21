from PIL import Image, ImageOps
from torch import nn
from torchvision import transforms
from torchvision.models import MobileNet_V3_Small_Weights, mobilenet_v3_small

Image.MAX_IMAGE_PIXELS = 20_000_000
WEIGHTS = MobileNet_V3_Small_Weights.DEFAULT
PREPROCESS = WEIGHTS.transforms()


def load_photo(source):
    with Image.open(source) as photo:
        if photo.width * photo.height > Image.MAX_IMAGE_PIXELS:
            raise ValueError("Image dimensions exceed the screening limit")
        return ImageOps.exif_transpose(photo).convert("RGB")


def build_model(pretrained=False):
    model = mobilenet_v3_small(weights=WEIGHTS if pretrained else None)
    model.classifier[-1] = nn.Linear(model.classifier[-1].in_features, 2)
    return model


TRAIN_TRANSFORM = transforms.Compose([
    transforms.RandomHorizontalFlip(),
    PREPROCESS,
])
