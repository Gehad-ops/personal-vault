/*
 *  Copyright (C) 2020 KeePassXC Team <team@keepassxc.org>
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 2 or (at your option)
 *  version 3 of the License.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

#include "DarkStyle.h"

#include <QDialog>
#include <QFile>
#include <QMainWindow>
#include <QMenuBar>
#include <QStatusBar>
#include <QToolBar>

#ifdef Q_OS_MACOS
#include "gui/osutils/OSUtils.h"
#endif

DarkStyle::DarkStyle()
    : BaseStyle()
{
#ifdef Q_OS_MACOS
    m_drawNativeMacOsToolBar = osUtils->isDarkMode();
#endif
}

QPalette DarkStyle::standardPalette() const
{
    auto palette = BaseStyle::standardPalette();

    // GitHub-inspired dark palette: near-black canvas, raised surfaces, green accent.
    palette.setColor(QPalette::Active, QPalette::Window, QRgb(0x0B1315));
    palette.setColor(QPalette::Inactive, QPalette::Window, QRgb(0x091012));
    palette.setColor(QPalette::Disabled, QPalette::Window, QRgb(0x0B1315));

    palette.setColor(QPalette::Active, QPalette::WindowText, QRgb(0xE4F0EE));
    palette.setColor(QPalette::Inactive, QPalette::WindowText, QRgb(0xB7CCC9));
    palette.setColor(QPalette::Disabled, QPalette::WindowText, QRgb(0x5A6B69));

    palette.setColor(QPalette::Active, QPalette::Text, QRgb(0xE4F0EE));
    palette.setColor(QPalette::Inactive, QPalette::Text, QRgb(0xB7CCC9));
    palette.setColor(QPalette::Disabled, QPalette::Text, QRgb(0x5A6B69));

    palette.setColor(QPalette::Active, QPalette::PlaceholderText, QRgb(0x8FA8A6));
    palette.setColor(QPalette::Inactive, QPalette::PlaceholderText, QRgb(0x8FA8A6));
    palette.setColor(QPalette::Disabled, QPalette::PlaceholderText, QRgb(0x5A6B69));

    palette.setColor(QPalette::Active, QPalette::BrightText, QRgb(0xFFFFFF));
    palette.setColor(QPalette::Inactive, QPalette::BrightText, QRgb(0xF0F6FC));
    palette.setColor(QPalette::Disabled, QPalette::BrightText, QRgb(0x5A6B69));

    palette.setColor(QPalette::Active, QPalette::Base, QRgb(0x0B1315));
    palette.setColor(QPalette::Inactive, QPalette::Base, QRgb(0x0B1315));
    palette.setColor(QPalette::Disabled, QPalette::Base, QRgb(0x101C1F));

    palette.setColor(QPalette::Active, QPalette::AlternateBase, QRgb(0x101C1F));
    palette.setColor(QPalette::Inactive, QPalette::AlternateBase, QRgb(0x101C1F));
    palette.setColor(QPalette::Disabled, QPalette::AlternateBase, QRgb(0x16282B));

    palette.setColor(QPalette::All, QPalette::ToolTipBase, QRgb(0x101C1F));
    palette.setColor(QPalette::All, QPalette::ToolTipText, QRgb(0xE4F0EE));

    palette.setColor(QPalette::Active, QPalette::Button, QRgb(0x122024));
    palette.setColor(QPalette::Inactive, QPalette::Button, QRgb(0x16282B));
    palette.setColor(QPalette::Disabled, QPalette::Button, QRgb(0x101C1F));

    palette.setColor(QPalette::Active, QPalette::ButtonText, QRgb(0xE4F0EE));
    palette.setColor(QPalette::Inactive, QPalette::ButtonText, QRgb(0xB7CCC9));
    palette.setColor(QPalette::Disabled, QPalette::ButtonText, QRgb(0x5A6B69));

    palette.setColor(QPalette::Active, QPalette::Highlight, QRgb(0x2FBF8A));
    palette.setColor(QPalette::Inactive, QPalette::Highlight, QRgb(0x3BD19A));
    palette.setColor(QPalette::Disabled, QPalette::Highlight, QRgb(0x1E6B52));

    palette.setColor(QPalette::Active, QPalette::HighlightedText, QRgb(0x04231A));
    palette.setColor(QPalette::Inactive, QPalette::HighlightedText, QRgb(0x04231A));
    palette.setColor(QPalette::Disabled, QPalette::HighlightedText, QRgb(0x8FA8A6));

    palette.setColor(QPalette::All, QPalette::Light, QRgb(0x1D2E31));
    palette.setColor(QPalette::All, QPalette::Midlight, QRgb(0x1D2E31));
    palette.setColor(QPalette::All, QPalette::Mid, QRgb(0x1D2E31));
    palette.setColor(QPalette::All, QPalette::Dark, QRgb(0x070C0E));
    palette.setColor(QPalette::All, QPalette::Shadow, QRgb(0x000000));

    palette.setColor(QPalette::All, QPalette::Link, QRgb(0x6EC1FF));
    palette.setColor(QPalette::Disabled, QPalette::Link, QRgb(0x5A6B69));
    palette.setColor(QPalette::All, QPalette::LinkVisited, QRgb(0xC5B5FF));
    palette.setColor(QPalette::Disabled, QPalette::LinkVisited, QRgb(0x5A6B69));

    return palette;
}

QString DarkStyle::getAppStyleSheet() const
{
    QFile extStylesheetFile(QStringLiteral(":/styles/dark/darkstyle.qss"));
    if (extStylesheetFile.open(QIODevice::ReadOnly | QIODevice::Text)) {
        return extStylesheetFile.readAll();
    }
    qWarning("Failed to load dark theme stylesheet.");
    return {};
}

void DarkStyle::polish(QWidget* widget)
{
    if (qobject_cast<QMainWindow*>(widget) || qobject_cast<QDialog*>(widget) || qobject_cast<QMenuBar*>(widget)
        || qobject_cast<QToolBar*>(widget)) {
        auto palette = widget->palette();
#if defined(Q_OS_MACOS)
        if (!osUtils->isDarkMode()) {
            palette.setColor(QPalette::Active, QPalette::Window, QRgb(0x0B1315));
            palette.setColor(QPalette::Inactive, QPalette::Window, QRgb(0x091012));
            palette.setColor(QPalette::Disabled, QPalette::Window, QRgb(0x0B1315));
        }
#else
        palette.setColor(QPalette::Active, QPalette::Window, QRgb(0x0B1315));
        palette.setColor(QPalette::Inactive, QPalette::Window, QRgb(0x091012));
        palette.setColor(QPalette::Disabled, QPalette::Window, QRgb(0x0B1315));
#endif

        widget->setPalette(palette);
    }
}
