#!/usr/bin/env python3
"""The Tizen command-line tools normally keep certificate passwords in a desktop keyring. A machine without a desktop
has none, and the tools then cannot sign. This stores the passwords in profiles.xml instead, in the tools' own (older)
encoded form; the file is made private. The tools forget them again whenever any profile is added or removed, so
tools/build-tv.sh calls this before every build (when PROFILE_PASSWORDS is set).

usage: set-profile-passwords.py <profile> <author-password-file> [<distributor-password-file>]"""
import os, re, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit

if len(sys.argv) < 3: sys.exit(__doc__)
kit.prepare()
prof, apw = sys.argv[1], open(sys.argv[2]).read().strip()
dpw = open(sys.argv[3]).read().strip() if len(sys.argv) > 3 else 'tizenpkcs12passfordsigner'   # the SDK's published default for its generic distributor


def enc(pw):
    r = subprocess.run([kit.JAVA, '-cp', ':'.join([kit.INSPECT + '/enc'] + kit.NCLI), 'Enc'], input=pw + '\n', capture_output=True, text=True)
    out = r.stdout.strip().splitlines()          # the SDK's logger chatters on stdout; the value is the last line
    if r.returncode or not out or not re.fullmatch(r'[A-Za-z0-9+/=]+', out[-1]): sys.exit('could not encode the password')
    return out[-1]


p = kit.PROFILES
s = open(p).read()
m = re.search(r'(<profile name="%s">)(.*?)(</profile>)' % re.escape(prof), s, re.S)
if not m: sys.exit('no such signing profile: ' + prof)
body = m.group(2)
ea, ed = enc(apw), enc(dpw)
body = re.sub(r'(distributor="0"[^>]*password=")[^"]*(")', lambda k: k.group(1) + ea + k.group(2), body)
body = re.sub(r'(distributor="1"[^>]*password=")[^"]*(")', lambda k: k.group(1) + ed + k.group(2), body)
open(p, 'w').write(s[:m.start(2)] + body + s[m.end(2):]); os.chmod(p, 0o600)
print('passwords set for profile', prof)
