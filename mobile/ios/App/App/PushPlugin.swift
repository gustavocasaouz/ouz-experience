import Foundation
import UIKit
import UserNotifications
import SafariServices
import WebKit
import Capacitor

/// Avisos no celular (APNs). O site pede a permissão e recebe o token para registrar o aparelho;
/// ao tocar num aviso, a WebView abre o caminho do site que veio junto ("link").
/// No site: window.Capacitor.nativePromise("OuzPush", <método>).
@objc(PushPlugin)
public class PushPlugin: CAPPlugin, CAPBridgedPlugin, NotificationHandlerProtocol {
    public let identifier = "PushPlugin"
    public let jsName = "OuzPush"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "register", returnType: CAPPluginReturnPromise)
    ]

    /// Pedidos de "register" esperando o token (só mexido na thread principal).
    private var waiting: [CAPPluginCall] = []

    override public func load() {
        bridge?.notificationRouter.pushNotificationHandler = self
        NotificationCenter.default.addObserver(self, selector: #selector(didRegister(_:)), name: .capacitorDidRegisterForRemoteNotifications, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(didFail(_:)), name: .capacitorDidFailToRegisterForRemoteNotifications, object: nil)
    }

    /// { permission: "granted" | "denied" | "prompt" }
    @objc func status(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            switch settings.authorizationStatus {
            case .authorized, .provisional, .ephemeral: call.resolve(["permission": "granted"])
            case .denied: call.resolve(["permission": "denied"])
            default: call.resolve(["permission": "prompt"])
            }
        }
    }

    /// Pede a permissão (só aparece na primeira vez) e devolve { token, environment }.
    @objc func register(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { granted, _ in
            guard granted else { return call.reject("Avisos não permitidos.", "denied") }
            DispatchQueue.main.async {
                self.waiting.append(call)
                UIApplication.shared.registerForRemoteNotifications()
                // Sem resposta do iOS, o site não fica esperando para sempre.
                DispatchQueue.main.asyncAfter(deadline: .now() + 20) {
                    guard let index = self.waiting.firstIndex(where: { $0 === call }) else { return }
                    self.waiting.remove(at: index).reject("O iPhone não respondeu ao registro dos avisos.", "timeout")
                }
            }
        }
    }

    @objc private func didRegister(_ notification: Notification) {
        guard let data = notification.object as? Data else { return }
        let token = data.map { String(format: "%02x", $0) }.joined()
        #if DEBUG
        let environment = "sandbox" // build do Xcode
        #else
        let environment = "production" // TestFlight e App Store
        #endif
        let calls = waiting
        waiting = []
        calls.forEach { $0.resolve(["token": token, "environment": environment]) }
    }

    @objc private func didFail(_ notification: Notification) {
        let calls = waiting
        waiting = []
        calls.forEach { $0.reject("Não foi possível registrar o aparelho.", "failed") }
    }

    // Com o app aberto, o aviso aparece em cima, como nos outros apps.
    public func willPresent(notification: UNNotification) -> UNNotificationPresentationOptions {
        return [.banner, .list, .sound]
    }

    public func didReceive(response: UNNotificationResponse) {
        guard let link = response.notification.request.content.userInfo["link"] as? String,
              link.hasPrefix("/"), !link.hasPrefix("//"),
              let base = bridge?.config.serverURL,
              let url = URL(string: link, relativeTo: base) else { return }
        DispatchQueue.main.async { _ = self.bridge?.webView?.load(URLRequest(url: url)) }
    }
}

/// Links para fora do site abrem numa janela do Safari dentro do app (com "Fechar" para voltar),
/// em vez de jogar a pessoa para o Safari. WhatsApp, Mapas e App Store continuam abrindo no app próprio;
/// telefone e e-mail não passam por aqui.
@objc(LinksPlugin)
public class LinksPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LinksPlugin"
    public let jsName = "OuzLinks"
    public let pluginMethods: [CAPPluginMethod] = []

    private let ownApps = ["wa.me", "whatsapp.com", "maps.apple.com", "apps.apple.com", "itunes.apple.com"]

    override public func shouldOverrideLoad(_ navigationAction: WKNavigationAction) -> NSNumber? {
        guard let url = navigationAction.request.url,
              let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https",
              let host = url.host?.lowercased() else { return nil }
        if let frame = navigationAction.targetFrame, !frame.isMainFrame { return nil } // conteúdo embutido na página
        if bridge?.config.shouldAllowNavigation(to: host) == true { return nil }
        if ownApps.contains(where: { host == $0 || host.hasSuffix("." + $0) }) { return nil }
        DispatchQueue.main.async {
            let safari = SFSafariViewController(url: url)
            safari.dismissButtonStyle = .close
            self.bridge?.viewController?.present(safari, animated: true)
        }
        return true
    }
}
