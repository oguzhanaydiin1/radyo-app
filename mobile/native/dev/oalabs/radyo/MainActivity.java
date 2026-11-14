package dev.oalabs.radyo;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // OA Radyo'nun yerel eklentisi: telefondaki müzikler, arka planda çalma, bildirim kontrolleri.
        registerPlugin(OANativePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
