import org.tizen.common.cert.CSRGenerator.CSRGeneratorForTizen;

/** Calls the request builder inside Samsung's own Certificate Manager plugin, so the requests are byte-for-byte what that tool makes.
 *  args: author <dir> <author name>            | distributor <dir> <account e-mail> <duid>...       (password on stdin)
 *  writes <dir>/author.csr + author.pri        | <dir>/distributor.csr + distributor.pri */
public class GenCsr {
  public static void main(String[] a) throws Exception {
    String pw = new java.io.BufferedReader(new java.io.InputStreamReader(System.in)).readLine();
    boolean ok;
    if (a[0].equals("author")) {
      ok = CSRGeneratorForTizen.generateCSR(new String[] { a[2], "", "", "", "", "" }, "author", pw, a[1]);
    } else {
      String[] duids = java.util.Arrays.copyOfRange(a, 3, a.length);
      ok = CSRGeneratorForTizen.generateCSRDistribute(new String[] { "TizenSDK", "", "", "", "", "" }, "distributor", pw, a[1], duids, a[2]);
    }
    System.err.println(ok ? "GENCSR_OK" : "GENCSR_FAILED");
    System.exit(ok ? 0 : 1);
  }
}
