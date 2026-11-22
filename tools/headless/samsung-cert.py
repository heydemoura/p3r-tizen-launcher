#!/usr/bin/env python3
"""Samsung TV developer certificate, without the Certificate Manager window — for machines with no desktop.

It does what Samsung's own Certificate Manager (cert-add-on 2.0.75) does, as read from that plugin. This is NOT an
official interface: it can stop working whenever Samsung changes theirs. On a machine with a desktop, use the
Certificate Manager of Tizen Studio instead (see the README).

  url        prints the Samsung account sign-in address to open in a browser
  listen     waits on http://localhost:4794/signin/callback for the result of that sign-in (the only address Samsung
             accepts for it) and keeps the short-lived access token in $TIZEN_KIT/secrets. The browser must reach THIS
             machine as "localhost:4794": from another computer, tunnel first (ssh -N -L 4794:localhost:4794 user@this-machine)
  request    makes an author certificate and a device-bound distributor certificate for one or more TVs (--duid, from
             `tools/tv.sh duid`), asks Samsung's developer CA to sign both, and registers them as a Tizen signing profile
  check      prepares the helper files and builds a throw-away request, to see that this machine has what is needed
  selftest   runs every local step against a throw-away CA and registers the result as profile "selftest"
             (proves the files work with the Tizen packager; a TV will not accept that profile)

Needs: Python 3 with the `cryptography` package, Tizen Studio with the Samsung Certificate Extension, TIZEN_KIT (see kit.py).
Delete $TIZEN_KIT/secrets/samsung-token.json when done: the certificates do not need it.
"""
import argparse, datetime, http.server, json, os, secrets, subprocess, sys, tempfile, time, urllib.error, urllib.parse, urllib.request
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import NameOID

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit

SEC = kit.SEC
LOGIN_URL = 'https://account.samsung.com/mobile/account/check.do?serviceID=v285zxnl3h&actionID=StartOAuth2&accessToken=Y&redirect_uri=http://localhost:4794/signin/callback'
AUTHOR_URL = 'https://svdca.samsungqbe.com/apis/v3/authors'
DIST_URL = 'https://svdca.samsungqbe.com/apis/v3/distributors'
TOKEN = SEC + '/samsung-token.json'


def private(path, data, mode='wb'):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, mode) as f: f.write(data)


def listen(minutes):
    """Wait for the sign-in result. Only reachable from this machine itself (127.0.0.1)."""
    got = {}

    class H(http.server.BaseHTTPRequestHandler):
        def log_message(self, *a): pass

        def finish_with(self, text, ok=True):
            body = f'<html><body style="font:20px sans-serif;margin:60px">{text}</body></html>'.encode()
            self.send_response(200 if ok else 400); self.send_header('Content-Type', 'text/html; charset=utf-8'); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)

        def handle_fields(self, raw):
            q = urllib.parse.parse_qs(raw)
            try: code = json.loads(q['code'][0])
            except Exception: return self.finish_with('Sign-in did not return a result. Please try the link again.', False)
            if not code.get('access_token') or not code.get('userId'): return self.finish_with('Sign-in result was incomplete. Please try the link again.', False)
            keep = {'access_token': code['access_token'], 'userId': code['userId'], 'email': code.get('inputEmailID', ''), 'expires_in': code.get('access_token_expires_in'), 'received': int(time.time())}
            private(TOKEN, json.dumps(keep), 'w'); got['ok'] = True
            self.finish_with('Signed in. You can close this tab.')

        def do_POST(self):
            if not self.path.startswith('/signin/callback'): return self.finish_with('Not found', False)
            self.handle_fields(self.rfile.read(int(self.headers.get('Content-Length') or 0)).decode('utf-8', 'replace'))

        def do_GET(self):
            if not self.path.startswith('/signin/callback'): return self.finish_with('Not found', False)
            self.handle_fields(urllib.parse.urlsplit(self.path).query)

    srv = http.server.HTTPServer(('127.0.0.1', 4794), H); srv.timeout = 5
    print('waiting for the sign-in result on localhost:4794 …', flush=True)
    end = time.time() + minutes * 60
    while time.time() < end and not got: srv.handle_request()
    srv.server_close()
    if not got: sys.exit('no sign-in arrived in time')
    t = json.load(open(TOKEN)); print(f"signed in as {t['email'] or t['userId']} (token kept in {TOKEN})")


def new_key(): return rsa.generate_private_key(public_exponent=65537, key_size=2048)


def author_csr(key, name):
    return x509.CertificateSigningRequestBuilder().subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, name)])).sign(key, hashes.SHA512())


def distributor_csr(key, email, duids):
    subj = [x509.NameAttribute(NameOID.COMMON_NAME, 'TizenSDK')] + ([x509.NameAttribute(NameOID.EMAIL_ADDRESS, email)] if email else [])
    san = [x509.UniformResourceIdentifier('URN:tizen:packageid=')] + [x509.UniformResourceIdentifier('URN:tizen:deviceid=' + d) for d in duids]
    return x509.CertificateSigningRequestBuilder().subject_name(x509.Name(subj)).add_extension(x509.SubjectAlternativeName(san), critical=False).sign(key, hashes.SHA512())


def ask_samsung(url, token, csr_bytes, csr_name, extra):
    """multipart/form-data laid out exactly as the plugin sends it: access_token, user_id, [extras], platform=VD, then the request file."""
    bnd = '*****'
    parts = [('access_token', token['access_token']), ('user_id', token['userId'])] + extra + [('platform', 'VD')]
    body = b''.join(f'--{bnd}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Disposition: form-data; name={k}\r\n\r\n{v}\r\n'.encode() for k, v in parts)
    body += f"--{bnd}\r\nContent-Disposition: form-data; name=csr; filename={csr_name}; filename*=utf-8''{csr_name}\r\n\r\n".encode() + csr_bytes + f'\r\n--{bnd}--\r\n'.encode()
    req = urllib.request.Request(url, data=body, method='POST', headers={'content-type': f'multipart/form-data; boundary="{bnd}"'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r: out = r.read()
    except urllib.error.HTTPError as e:
        sys.exit(f'Samsung refused the request to {url}: HTTP {e.code} {e.read()[:400].decode("utf-8", "replace")}')
    if b'BEGIN CERTIFICATE' not in out: sys.exit(f'unexpected answer from {url}: {out[:400].decode("utf-8", "replace")}')
    return out


def load_certs(pem_bytes): return x509.load_pem_x509_certificates(pem_bytes)


def make_p12(path, key, chain, password, alias):
    # the Tizen tools run on Java 8, which only reads the older PKCS#12 protection (3DES + SHA-1), so write that form
    enc = serialization.PrivateFormat.PKCS12.encryption_builder().kdf_rounds(2048).key_cert_algorithm(pkcs12.PBES.PBESv1SHA1And3KeyTripleDESCBC).hmac_hash(hashes.SHA1()).build(password.encode())
    data = pkcs12.serialize_key_and_certificates(alias.encode(), key, chain[0], chain[1:], enc)
    private(path, data)


def register(profile, author_p12, apw, dist_p12, dpw):
    env = dict(os.environ, PATH=f'{kit.STUDIO}/tools:{kit.STUDIO}/tools/ide/bin:{kit.STUDIO}/jdk/bin:' + os.environ['PATH'])
    subprocess.run(['tizen', 'security-profiles', 'remove', '-n', profile], env=env, capture_output=True)
    r = subprocess.run(['tizen', 'security-profiles', 'add', '-f', '-n', profile, '-a', author_p12, '-p', apw, '-d', dist_p12, '-dp', dpw], env=env, capture_output=True, text=True)
    if 'Succeed' not in r.stdout: sys.exit('could not register the signing profile: ' + (r.stdout + r.stderr)[-400:])
    for f, v in ((f'{SEC}/{profile}-author.pass', apw), (f'{SEC}/{profile}-dist.pass', dpw)):
        if not os.path.exists(f) or open(f).read().strip() != v: private(f, v, 'w')
    r = subprocess.run([sys.executable, kit.HERE + '/set-profile-passwords.py', profile, f'{SEC}/{profile}-author.pass', f'{SEC}/{profile}-dist.pass'], capture_output=True, text=True)
    if r.returncode: sys.exit('could not store the profile passwords: ' + r.stdout + r.stderr)
    print(f'signing profile "{profile}" is ready')


def official_csr(kind, folder, pw, *args):
    """Make <folder>/<kind>.csr and <kind>.pri with the request builder inside Samsung's Certificate Manager plugin."""
    r = subprocess.run([kit.JAVA, '-cp', ':'.join(kit.cert_classpath()), 'GenCsr', kind, folder] + list(args), input=pw + '\n', capture_output=True, text=True)
    if r.returncode or 'GENCSR_OK' not in r.stderr or not os.path.exists(f'{folder}/{kind}.csr') or not os.path.exists(f'{folder}/{kind}.pri'):
        sys.exit(f'could not build the {kind} request: ' + r.stderr[-300:])
    for ext in ('csr', 'pri'): os.chmod(f'{folder}/{kind}.{ext}', 0o600)


def secret_file(path):
    if not os.path.exists(path): private(path, secrets.token_urlsafe(15), 'w')
    return open(path).read().strip()


def issuing_ca(leaf):
    """The CA certificate (among those shipped with Samsung's plugin) that really signed this certificate."""
    import glob
    for f in sorted(glob.glob(kit.INSPECT + '/cert/res/ca/*')):
        try: cas = load_certs(open(f, 'rb').read())
        except Exception: continue
        for ca in cas:
            if ca.subject != leaf.issuer: continue
            try: leaf.verify_directly_issued_by(ca)
            except Exception: continue
            return ca, os.path.basename(f)
    sys.exit('the certificate was not signed by any CA shipped with the Samsung plugin; issuer: ' + leaf.issuer.rfc4514_string())


def request(duids, name, profile):
    """Resumable: a step whose result is already on disk is not repeated, so a retry never asks Samsung twice for the same thing."""
    if not os.path.exists(TOKEN): sys.exit('not signed in yet (run: samsung-cert.py listen)')
    token = json.load(open(TOKEN))
    d = f'{SEC}/{profile}'; os.makedirs(d, mode=0o700, exist_ok=True)
    apw, dpw = secret_file(f'{SEC}/{profile}-author.pass'), secret_file(f'{SEC}/{profile}-dist.pass')
    steps = [('author', apw, AUTHOR_URL, [], [name]),
             ('distributor', dpw, DIST_URL, [('privilege_level', 'Public'), ('developer_type', 'Individual')], [token.get('email', '')] + duids)]
    for kind, pw, url, extra, args in steps:
        if os.path.exists(f'{d}/{kind}.crt'): print(f'{kind}: already issued, kept'); continue
        if not (os.path.exists(f'{d}/{kind}.csr') and os.path.exists(f'{d}/{kind}.pri')): official_csr(kind, d, pw, *args)
        crt = ask_samsung(url, token, open(f'{d}/{kind}.csr', 'rb').read(), f'{kind}.csr', extra)
        private(f'{d}/{kind}.crt', crt); print(f'{kind}: issued by Samsung')
    for kind, pw in (('author', apw), ('distributor', dpw)):
        leaf = load_certs(open(f'{d}/{kind}.crt', 'rb').read())[0]
        key = serialization.load_der_private_key(open(f'{d}/{kind}.pri', 'rb').read(), pw.encode())
        if key.public_key().public_numbers() != leaf.public_key().public_numbers(): sys.exit(f'{kind}: the certificate does not belong to the key on disk')
        ca, ca_file = issuing_ca(leaf)
        make_p12(f'{d}/{kind}.p12', key, [leaf, ca], pw, 'usercertificate')
        san = ''
        try: san = ' | ' + ', '.join(u.value for u in leaf.extensions.get_extension_for_class(x509.SubjectAlternativeName).value)
        except x509.ExtensionNotFound: pass
        print(f'{kind}: {leaf.subject.rfc4514_string()} | signed by {ca_file} | valid {leaf.not_valid_before_utc:%Y-%m-%d} to {leaf.not_valid_after_utc:%Y-%m-%d}{san}')
    register(profile, f'{d}/author.p12', apw, f'{d}/distributor.p12', dpw)


def selftest():
    """Everything except Samsung's signature: local CA stands in for theirs."""
    d = f'{SEC}/selftest'; os.makedirs(d, mode=0o700, exist_ok=True)
    now = datetime.datetime.now(datetime.timezone.utc)

    def ca(cn):
        k = new_key(); n = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, cn)])
        c = x509.CertificateBuilder().subject_name(n).issuer_name(n).public_key(k.public_key()).serial_number(x509.random_serial_number()).not_valid_before(now).not_valid_after(now + datetime.timedelta(days=30)).add_extension(x509.BasicConstraints(True, None), True).sign(k, hashes.SHA256())
        return k, c

    def sign(csr, cak, cac):
        b = x509.CertificateBuilder().subject_name(csr.subject).issuer_name(cac.subject).public_key(csr.public_key()).serial_number(x509.random_serial_number()).not_valid_before(now).not_valid_after(now + datetime.timedelta(days=30))
        for e in csr.extensions: b = b.add_extension(e.value, e.critical)
        return b.sign(cak, hashes.SHA256())
    ak, ac = ca('selftest author CA'); dk, dc = ca('selftest distributor CA')
    akey, dkey = new_key(), new_key()
    acsr, dcsr = author_csr(akey, 'Self Test'), distributor_csr(dkey, 'someone@example.com', ['ABCDEFGHIJKLM'])
    private(d + '/author.csr', acsr.public_bytes(serialization.Encoding.PEM)); private(d + '/distributor.csr', dcsr.public_bytes(serialization.Encoding.PEM))
    apw, dpw = secrets.token_urlsafe(15), secrets.token_urlsafe(15)
    make_p12(d + '/author.p12', akey, [sign(acsr, ak, ac), ac], apw, 'usercertificate')
    make_p12(d + '/distributor.p12', dkey, [sign(dcsr, dk, dc), dc], dpw, 'usercertificate')
    register('selftest', d + '/author.p12', apw, d + '/distributor.p12', dpw)
    print('request files:', d + '/author.csr', d + '/distributor.csr')


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    p = sub.add_parser('listen'); p.add_argument('--minutes', type=float, default=30)
    p = sub.add_parser('request'); p.add_argument('--duid', action='append', required=True); p.add_argument('--name', default='Main Menu'); p.add_argument('--profile', default='samsung')
    sub.add_parser('selftest'); sub.add_parser('url'); sub.add_parser('check')
    a = ap.parse_args()
    if a.cmd == 'url': print(LOGIN_URL); sys.exit(0)
    kit.prepare()
    if a.cmd == 'listen': listen(a.minutes)
    elif a.cmd == 'request': request(a.duid, a.name, a.profile)
    elif a.cmd == 'selftest': selftest()
    else:
        with tempfile.TemporaryDirectory() as d:
            official_csr('author', d, 'throwaway-password', 'Check')
            import warnings
            with warnings.catch_warnings():
                warnings.simplefilter('ignore')        # (the plugin leaves the unused name fields empty, which the reader remarks on)
                who = x509.load_pem_x509_csr(open(d + '/author.csr', 'rb').read()).subject.get_attributes_for_oid(NameOID.COMMON_NAME)[0].value
            print('ready: Tizen Studio at', kit.STUDIO, '| profiles in', kit.PROFILES, '| helper files in', kit.KIT, '| test request made for', who)
