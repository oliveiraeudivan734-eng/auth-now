import React, { useEffect, useState } from "react";
import { SafeAreaView, View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { StatusBar } from "expo-status-bar";

const API_URL = "https://SEU-SERVIDOR-AQUI.com";

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [flash, setFlash] = useState(false);
  const [state, setState] = useState("scan");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (permission && !permission.granted) requestPermission();
  }, [permission]);

  async function verify({ data }) {
    if (scanned) return;
    setScanned(true);
    setState("loading");
    setMessage("");

    try {
      const r = await fetch(`${API_URL}/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: data })
      });
      const d = await r.json();
      setState(d.ok ? "valid" : "invalid");
      setMessage(d.message || "Resultado recebido.");
    } catch (e) {
      setState("error");
      setMessage("Servidor ainda não configurado.");
    }
  }

  function retry() {
    setScanned(false);
    setState("scan");
    setMessage("");
  }

  if (!permission) {
    return <View style={styles.center}><ActivityIndicator size="large" /></View>;
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.darkTitle}>Permissão da câmera</Text>
        <Text style={styles.darkText}>Permita a câmera para escanear o QR Code.</Text>
        <TouchableOpacity style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>Permitir</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.menu}
          onPress={() => Alert.alert("Auth Now", "Sistema de autenticação por QR Code")}
        >
          <View style={styles.line} /><View style={styles.line} /><View style={styles.line} />
        </TouchableOpacity>
        <Text style={styles.logo}>auth <Text style={styles.green}>now</Text></Text>
      </View>

      <View style={styles.camera}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={scanned ? undefined : verify}
          enableTorch={flash}
        />
        <View style={styles.frame}>
          <View style={[styles.corner, styles.tl]} /><View style={[styles.corner, styles.tr]} />
          <View style={[styles.corner, styles.bl]} /><View style={[styles.corner, styles.br]} />
        </View>
        <TouchableOpacity style={styles.flash} onPress={() => setFlash(!flash)}>
          <Text style={{ fontSize: 30 }}>{flash ? "☀" : "🔦"}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.status}>
        <Text style={styles.statusText}>
          {state === "scan" ? "Aponte para o QR Code" :
           state === "loading" ? "Verificando..." :
           state === "valid" ? "✓ QR Code válido" :
           state === "invalid" ? "✕ QR Code inválido" :
           "⚠ Erro de conexão"}
        </Text>
      </View>

      <View style={styles.info}>
        <View style={styles.infoIcon}><Text style={styles.i}>i</Text></View>
        <Text style={styles.infoText}>
          {message || "Centralize o QR Code dentro da moldura para autenticar."}
        </Text>
      </View>

      <View style={{ flex: 1 }} />
      <TouchableOpacity style={styles.retry} onPress={retry}>
        <Text style={styles.retryText}>
          {state === "scan" ? "Pronto para escanear" : "Tentar novamente"}
        </Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#3736a8" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30 },
  darkTitle: { fontSize: 24, fontWeight: "800", marginBottom: 10 },
  darkText: { fontSize: 16, textAlign: "center", marginBottom: 20 },
  header: { height: 150, alignItems: "center", justifyContent: "center" },
  menu: { position: "absolute", left: 22, top: 28, width: 60, height: 60, borderRadius: 18, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  line: { width: 32, height: 5, borderRadius: 4, backgroundColor: "#374151", marginVertical: 3 },
  logo: { fontSize: 38, fontWeight: "900", color: "#fff" },
  green: { color: "#54df62" },
  camera: { marginHorizontal: 18, height: 410, borderRadius: 28, overflow: "hidden", borderWidth: 2, borderColor: "#ddd", backgroundColor: "#111" },
  frame: { ...StyleSheet.absoluteFillObject, margin: 22 },
  corner: { position: "absolute", width: 62, height: 62, borderColor: "#69df52", borderWidth: 4 },
  tl: { left: 0, top: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 25 },
  tr: { right: 0, top: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 25 },
  bl: { left: 0, bottom: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 25 },
  br: { right: 0, bottom: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 25 },
  flash: { position: "absolute", right: 0, bottom: 0, width: 82, height: 82, borderRadius: 41, backgroundColor: "#343c61", alignItems: "center", justifyContent: "center" },
  status: { height: 45, marginHorizontal: 32, marginTop: 28, borderRadius: 23, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  statusText: { fontSize: 16, fontWeight: "800", color: "#333" },
  info: { alignItems: "center", paddingHorizontal: 35, marginTop: 18 },
  infoIcon: { width: 45, height: 45, borderRadius: 23, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  i: { fontSize: 27, fontWeight: "900", color: "#3736a8" },
  infoText: { color: "#fff", textAlign: "center", fontSize: 16, lineHeight: 22, marginTop: 10 },
  retry: { height: 60, marginHorizontal: 34, marginBottom: 20, borderRadius: 13, backgroundColor: "#43d34b", alignItems: "center", justifyContent: "center" },
  retryText: { color: "#fff", fontSize: 19, fontWeight: "800" },
  btn: { backgroundColor: "#3736a8", padding: 15, borderRadius: 12 },
  btnText: { color: "#fff", fontWeight: "800" }
});
