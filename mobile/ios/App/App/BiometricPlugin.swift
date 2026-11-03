import Foundation
import LocalAuthentication
import Security
import Capacitor

/// WebView do app com os plugins nativos próprios do OUZ registrados.
class OuzBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(BiometricPlugin())
        bridge?.registerPluginInstance(PushPlugin())
        bridge?.registerPluginInstance(LinksPlugin())
        // Voltar arrastando da borda esquerda, como em qualquer app do iPhone (usa o histórico do site).
        webView?.allowsBackForwardNavigationGestures = true
    }
}

/// Entrada por Face ID: guarda no Keychain o refresh token de uma sessão própria do aparelho,
/// liberado só pela biometria cadastrada hoje no iPhone. A senha nunca é guardada.
/// No site: window.Capacitor.nativePromise("OuzBiometric", <método>, <opções>).
@objc(BiometricPlugin)
public class BiometricPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BiometricPlugin"
    public let jsName = "OuzBiometric"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "enable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unlock", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "replace", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise)
    ]

    private let service = "br.com.ouzgroup.experience.faceid"
    private let account = "session"

    /// { available, biometry: "faceID" | "touchID" | "none", enabled }
    @objc func status(_ call: CAPPluginCall) {
        let context = LAContext()
        var error: NSError?
        let available = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
        call.resolve(["available": available, "biometry": biometryName(context), "enabled": hasItem()])
    }

    /// Confirma com a biometria (mostra o pedido de permissão na primeira vez) e guarda o token.
    @objc func enable(_ call: CAPPluginCall) {
        guard let token = call.getString("token"), !token.isEmpty else { return call.reject("Token ausente.", "invalid") }
        let context = LAContext()
        context.localizedCancelTitle = "Agora não"
        let reason = call.getString("reason") ?? "Ative a entrada rápida no OUZ Experience."
        context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason) { ok, error in
            guard ok else { return self.reject(call, error) }
            let status = self.store(token)
            status == errSecSuccess ? call.resolve() : call.reject("Não foi possível guardar o acesso.", "keychain", nil, ["status": status])
        }
    }

    /// Pede a biometria e devolve { token }.
    @objc func unlock(_ call: CAPPluginCall) {
        let reason = call.getString("reason") ?? "Entre no OUZ Experience."
        DispatchQueue.global(qos: .userInitiated).async {
            let context = LAContext()
            context.localizedCancelTitle = "Usar senha"
            let query: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: self.service,
                kSecAttrAccount as String: self.account,
                kSecReturnData as String: true,
                kSecMatchLimit as String: kSecMatchLimitOne,
                kSecUseOperationPrompt as String: reason,
                kSecUseAuthenticationContext as String: context
            ]
            var result: AnyObject?
            let status = SecItemCopyMatching(query as CFDictionary, &result)
            switch status {
            case errSecSuccess:
                guard let data = result as? Data, let token = String(data: data, encoding: .utf8) else {
                    return call.reject("Acesso inválido.", "notEnabled")
                }
                call.resolve(["token": token])
            case errSecUserCanceled:
                call.reject("Cancelado.", "cancelled")
            case errSecItemNotFound:
                // Biometria do aparelho mudou (o item é invalidado) ou nunca foi ativada.
                call.reject("Entrada por Face ID não está ativa.", "notEnabled")
            default:
                call.reject("Não foi possível confirmar a biometria.", "failed", nil, ["status": status])
            }
        }
    }

    /// Troca o token guardado (o servidor gira o refresh token a cada uso). Não pede a biometria.
    @objc func replace(_ call: CAPPluginCall) {
        guard let token = call.getString("token"), !token.isEmpty else { return call.reject("Token ausente.", "invalid") }
        let status = store(token)
        status == errSecSuccess ? call.resolve() : call.reject("Não foi possível guardar o acesso.", "keychain", nil, ["status": status])
    }

    @objc func clear(_ call: CAPPluginCall) {
        deleteItem()
        call.resolve()
    }

    // MARK: - Keychain

    private func store(_ token: String) -> OSStatus {
        deleteItem()
        guard let access = SecAccessControlCreateWithFlags(nil, kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly, .biometryCurrentSet, nil) else {
            return errSecParam
        }
        let item: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrAccessControl as String: access,
            kSecValueData as String: Data(token.utf8)
        ]
        return SecItemAdd(item as CFDictionary, nil)
    }

    /// Consulta só os atributos: não pede a biometria.
    private func hasItem() -> Bool {
        let context = LAContext()
        context.interactionNotAllowed = true
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnAttributes as String: true,
            kSecUseAuthenticationContext as String: context
        ]
        let status = SecItemCopyMatching(query as CFDictionary, nil)
        return status == errSecSuccess || status == errSecInteractionNotAllowed
    }

    private func deleteItem() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        SecItemDelete(query as CFDictionary)
    }

    private func biometryName(_ context: LAContext) -> String {
        switch context.biometryType {
        case .faceID: return "faceID"
        case .touchID: return "touchID"
        default: return "none"
        }
    }

    private func reject(_ call: CAPPluginCall, _ error: Error?) {
        let code = (error as? LAError)?.code
        if code == .userCancel || code == .appCancel || code == .systemCancel || code == .userFallback {
            call.reject("Cancelado.", "cancelled")
        } else {
            call.reject(error?.localizedDescription ?? "Biometria indisponível.", "failed")
        }
    }
}
