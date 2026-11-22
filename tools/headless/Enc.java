import org.tizen.common.util.CipherUtil;
public class Enc {
  public static void main(String[] a) throws Exception {
    java.io.BufferedReader r = new java.io.BufferedReader(new java.io.InputStreamReader(System.in));
    String pw = r.readLine();
    String e = CipherUtil.getEncryptedString(pw);
    if (!pw.equals(CipherUtil.getDecryptedString(e))) throw new RuntimeException("round trip failed");
    System.out.print(e);
  }
}
