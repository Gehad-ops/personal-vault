#include <QApplication>
#include <QFile>

#include "core/Config.h"
#include "crypto/Crypto.h"
#include "PersonalVaultWindow.h"

int main(int argc, char** argv)
{
    QApplication app(argc, argv);
    app.setApplicationName("PersonalVault");
    app.setApplicationDisplayName("Personal Vault");
    app.setOrganizationName("PersonalVault");

    Config::createConfigFromFile({}, {});
    if (!Crypto::init()) {
        return 1;
    }

    QFile style(QStringLiteral(":/personalvault.qss"));
    if (style.open(QIODevice::ReadOnly)) {
        app.setStyleSheet(QString::fromUtf8(style.readAll()));
    }

    PersonalVaultWindow window;
    if (!qEnvironmentVariableIsEmpty("PV_SMOKE_FILE")) {
        const auto file = qEnvironmentVariable("PV_SMOKE_FILE");
        const auto password = qEnvironmentVariable("PV_SMOKE_PASSWORD");
        const bool ok = window.openVaultWithPassword(file, password);
        const auto out = qEnvironmentVariable("PV_SMOKE_OUT");
        if (!out.isEmpty()) {
            QFile result(out);
            if (result.open(QIODevice::WriteOnly)) {
                result.write(ok ? "ok" : "fail");
            }
        }
        return ok ? 0 : 1;
    }

    window.show();

    if (argc > 1) {
        window.openVault(QString::fromLocal8Bit(argv[1]));
    } else {
        window.openLastVault();
    }

    return app.exec();
}
