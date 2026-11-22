"""Where things are for the headless helpers, and the one-time preparation they share.

TIZEN_KIT     a folder of your choice that holds (or will hold) the helpers' own files: secrets/ and inspect/.
              If it also holds the Tizen Studio folder (tizen-studio/), nothing else needs setting.
TIZEN_STUDIO  the Tizen Studio folder, when it is somewhere else (default: $TIZEN_KIT/tizen-studio, else ~/tizen-studio).
The Tizen tools' data folder (where profiles.xml lives) is read from Tizen Studio's own sdk.info.
"""
import glob, os, subprocess, sys, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
KIT = os.environ.get('TIZEN_KIT') or os.path.expanduser('~/.local/share/tizen-headless')
STUDIO = os.environ.get('TIZEN_STUDIO') or next((p for p in (KIT + '/tizen-studio', os.path.expanduser('~/tizen-studio')) if os.path.isdir(p)), '')
SEC, INSPECT = KIT + '/secrets', KIT + '/inspect'
JAVA, JAVAC = STUDIO + '/jdk/bin/java', STUDIO + '/jdk/bin/javac'
NCLI = sorted(glob.glob(STUDIO + '/tools/ide/lib-ncli/*.jar'))


def data_dir():
    try:
        for line in open(STUDIO + '/sdk.info'):
            if line.startswith('TIZEN_SDK_DATA_PATH='): return line.split('=', 1)[1].strip()
    except OSError: pass
    return os.path.expanduser('~/tizen-studio-data')


PROFILES = data_dir() + '/profile/profiles.xml'


def cert_classpath():
    return [INSPECT + '/gencsr', INSPECT + '/cert'] + sorted(glob.glob(INSPECT + '/cert/lib/*.jar')) + NCLI


def prepare():
    """Unpack Samsung's Certificate Manager plugin (part of the "Samsung Certificate Extension" of Tizen Studio) and build
    the two small Java programs that call into it. Done once; the results live in $TIZEN_KIT/inspect."""
    if not os.path.isdir(STUDIO): sys.exit('Tizen Studio was not found: set TIZEN_STUDIO to its folder (or TIZEN_KIT to a folder that contains tizen-studio/)')
    if not os.path.exists(JAVAC): sys.exit('no Java compiler at ' + JAVAC + ' (Tizen Studio normally brings its own JDK there)')
    os.makedirs(SEC, mode=0o700, exist_ok=True); os.makedirs(INSPECT, exist_ok=True)
    if not os.path.isdir(INSPECT + '/cert/org'):
        jars = sorted(glob.glob(STUDIO + '/ide/plugins/org.tizen.common.cert_*.jar'))
        if not jars: sys.exit('the Samsung Certificate Extension is not installed in ' + STUDIO + ' (Package Manager → Extension SDK → Samsung Certificate Extension; command line: package-manager-cli.bin install cert-add-on)')
        with zipfile.ZipFile(jars[-1]) as z: z.extractall(INSPECT + '/cert')
    for name, cp in (('gencsr/GenCsr', cert_classpath()), ('enc/Enc', NCLI)):
        folder, cls = name.split('/')
        if os.path.exists(f'{INSPECT}/{folder}/{cls}.class'): continue
        os.makedirs(f'{INSPECT}/{folder}', exist_ok=True)
        r = subprocess.run([JAVAC, '-nowarn', '-cp', ':'.join(cp), '-d', f'{INSPECT}/{folder}', f'{HERE}/{cls}.java'], capture_output=True, text=True)
        if r.returncode or not os.path.exists(f'{INSPECT}/{folder}/{cls}.class'): sys.exit(f'could not build {cls}.java: ' + (r.stdout + r.stderr)[-500:])
