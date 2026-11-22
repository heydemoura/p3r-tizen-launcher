"""Read Main Menu's Tizen identity and check the SDK's signed output."""
import argparse
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import BadZipFile, ZipFile


MANIFEST = Path(__file__).resolve().parents[1] / "tv" / "config.xml"
APPLICATION = "{http://tizen.org/ns/widgets}application"
SIGNATURE = "{http://www.w3.org/2000/09/xmldsig#}"


def identity(manifest):
    apps = ET.fromstring(manifest).findall(APPLICATION)
    if len(apps) != 1:
        raise ValueError("Expected one Tizen application in config.xml")
    return apps[0].attrib["id"], apps[0].attrib["package"]


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
    args = parser.parse_args()
    try:
        expected = identity(MANIFEST.read_bytes())
        if args.command == "check":
            check_widget(args.widget, expected)
        else:
            print(*expected)
    except (OSError, KeyError, ValueError, ET.ParseError, BadZipFile) as error:
        parser.exit(1, f"Widget check failed: {error}\n")
