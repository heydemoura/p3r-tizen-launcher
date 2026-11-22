"""Assemble Main Menu's runtime files and validate Tizen widgets."""
import argparse
import json
from pathlib import Path
import re
import shutil
from tempfile import NamedTemporaryFile
from xml.etree import ElementTree as ET
from zipfile import BadZipFile, ZIP_DEFLATED, ZipFile, ZipInfo


ROOT = Path(__file__).resolve().parents[1]
WIDGET = "{http://www.w3.org/ns/widgets}"
APPLICATION = "{http://tizen.org/ns/widgets}application"
SIGNATURE = "{http://www.w3.org/2000/09/xmldsig#}"


def identity(manifest):
    apps = ET.fromstring(manifest).findall(APPLICATION)
    if len(apps) != 1:
        raise ValueError("Expected one Tizen application in config.xml")
    return apps[0].attrib["id"], apps[0].attrib["package"]


def source_file(source, name):
    path = source / name
    if path.resolve() != path or not path.is_file():
        raise ValueError(f"Expected a regular source file: {name}")
    return path


def payload(source, tag=None):
    """Map widget paths to the files needed by the launcher in this checkout."""
    source = source.resolve()
    paths = [
        "index.html", "app.js", "LICENSE", "NOTICE", "assets/home-motion.js",
        "assets/hero.png", "assets/home-scene.webp", "assets/quest-scene.webp",
        "assets/quest-idle.webp", "assets/home-frames/index.js", "assets/home-frames/damage.js",
        "assets/menu-sfx/focus.wav", "assets/menu-sfx/confirm.wav", "assets/menu-sfx/back.wav",
    ]
    html = source_file(source, "index.html").read_text(encoding="utf-8")
    paths.extend(re.findall(r"fonts/[A-Za-z0-9_.-]+\.(?:otf|ttf)\b", html))
    frames = source_file(source, "assets/home-frames/index.js").read_text(encoding="utf-8")
    spec = re.fullmatch(r"\s*const HOME_MOTION_FRAMES\s*=\s*(\{.*\})\s*;\s*", frames, re.DOTALL)
    if not spec:
        raise ValueError("Invalid Home animation manifest")
    data = json.loads(spec[1])
    for file in [data["map"], *data["pages"]]:
        if not re.fullmatch(r"[\w.-]+\.png", file):
            raise ValueError(f"Invalid Home animation filename: {file}")
        paths.append("assets/home-frames/" + file)
    files = {p: source_file(source, p) for p in paths}
    files.update({
        "icon.png": source_file(source, "tv/icon.png"),
        "config.xml": source_file(source, "tv/config.xml"),
        "fonts/LICENSES.txt": source_file(source, "tv/FONTS.txt"),
    })
    manifest = ET.parse(files["config.xml"]).getroot()
    for name in ("content", "icon"):
        element = manifest.find(WIDGET + name)
        if element is None or element.get("src") not in files:
            raise ValueError(f"Widget manifest references a missing {name} file")
    if tag is not None:
        package = json.loads(source_file(source, "package.json").read_text(encoding="utf-8"))
        lock = json.loads(source_file(source, "package-lock.json").read_text(encoding="utf-8"))
        version = package["version"]
        base = re.split(r"[-+]", version, maxsplit=1)[0]
        if lock["version"] != version or lock["packages"][""]["version"] != version or manifest.get("version") != base:
            raise ValueError("Package, lockfile, and TV manifest versions disagree")
        label = tag[1:] if tag.startswith("v") else tag
        release = re.fullmatch(r"(\d+\.\d+\.\d+)(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?", label)
        if release and version not in (label, release[1]):
            raise ValueError(f"Release tag {tag} does not match package version {version}")
    return files


def portable(output, files):
    """Write a reproducible, unsigned widget that can be signed for the recipient's TV."""
    output.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(dir=output.parent, delete=False) as temporary:
        path = Path(temporary.name)
    try:
        with ZipFile(path, "w") as archive:
            for name, file in sorted(files.items()):
                entry = ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
                entry.create_system = 3
                entry.external_attr = 0o100644 << 16
                archive.writestr(entry, file.read_bytes(), compress_type=ZIP_DEFLATED, compresslevel=6)
        with ZipFile(path) as archive:
            if archive.testzip() is not None or set(archive.namelist()) != set(files):
                raise ValueError("Widget contents failed verification")
            if identity(archive.read("config.xml")) != identity(files["config.xml"].read_bytes()):
                raise ValueError("Widget application or package ID differs from tv/config.xml")
        path.chmod(0o644)
        path.replace(output)
    finally:
        path.unlink(missing_ok=True)


def check_widget(path, expected):
    with ZipFile(path) as archive:
        if identity(archive.read("config.xml")) != expected:
            raise ValueError("Widget application or package ID differs from tv/config.xml")
        for name in ("author-signature.xml", "signature1.xml"):
            signature = ET.fromstring(archive.read(name))
            value = signature.findtext(SIGNATURE + "SignatureValue", default="")
            if signature.tag != SIGNATURE + "Signature" or not value.strip():
                raise ValueError(f"Missing signature value in {name}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("identity")
    commands.add_parser("check").add_argument("widget", type=Path)
    stage = commands.add_parser("stage", help="copy the runtime files into an empty SDK build directory")
    stage.add_argument("directory", type=Path)
    pack = commands.add_parser("portable", help="build an unsigned widget for recipients to sign")
    pack.add_argument("widget", type=Path)
    pack.add_argument("--source", type=Path, default=ROOT)
    pack.add_argument("--tag", help="verify the release tag against the widget and npm versions")
    args = parser.parse_args()
    try:
        if args.command == "portable":
            portable(args.widget, payload(args.source, args.tag))
        elif args.command == "stage":
            if args.directory.exists() and any(args.directory.iterdir()):
                raise ValueError(f"SDK staging directory is not empty: {args.directory}")
            for name, file in payload(ROOT).items():
                destination = args.directory / name
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(file, destination)
        elif args.command == "check":
            expected = identity((ROOT / "tv/config.xml").read_bytes())
            check_widget(args.widget, expected)
        else:
            print(*identity((ROOT / "tv/config.xml").read_bytes()))
    except (OSError, KeyError, ValueError, ET.ParseError, BadZipFile) as error:
        parser.exit(1, f"Widget check failed: {error}\n")
