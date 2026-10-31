#include "PersonalVaultWindow.h"

#include <QApplication>
#include <QButtonGroup>
#include <QClipboard>
#include <QComboBox>
#include <QCursor>
#include <QDateTime>
#include <QDialog>
#include <QFileDialog>
#include <QFileInfo>
#include <QFont>
#include <QFormLayout>
#include <QHBoxLayout>
#include <QInputDialog>
#include <QLabel>
#include <QLineEdit>
#include <QListWidget>
#include <QMenu>
#include <QMessageBox>
#include <QPushButton>
#include <QRegularExpression>
#include <QScrollArea>
#include <QCheckBox>
#include <QKeySequence>
#include <QShortcut>
#include <QSizeGrip>
#include <QMouseEvent>
#include <QIcon>
#include <QPainter>
#include <QEnterEvent>
#include <QPaintEvent>
#include <QPixmap>
#include <QResizeEvent>
#include <QSettings>
#include <QWindow>
#include <QSplitter>
#include <QStyle>
#include <QStatusBar>
#include <QTextEdit>
#include <QTimer>
#include <QVBoxLayout>

#include <algorithm>
#include <functional>

#include "browser/BrowserService.h"
#include "browser/BrowserSettings.h"
#include "core/Database.h"
#include "core/Entry.h"
#include "core/EntryAttributes.h"
#include "core/Group.h"
#include "core/Metadata.h"
#include "core/Totp.h"
#include "gui/widgets/ElidedLabel.h"
#include "keys/CompositeKey.h"
#include "keys/PasswordKey.h"
#include "format/BitwardenReader.h"

namespace
{
const QString CARD_HOLDER = QStringLiteral("Cardholder");
const QString CARD_NUMBER = QStringLiteral("Card Number");
const QString CARD_EXPIRY = QStringLiteral("Expiry");
const QString CARD_CVV = QStringLiteral("CVV");

const QList<QPair<QColor, QColor>>& avatarPalette()
{
    static const QList<QPair<QColor, QColor>> palette = {
        {QColor("#3A2420"), QColor("#FFA38F")},
        {QColor("#1B2F40"), QColor("#8FCBFF")},
        {QColor("#3A2D1A"), QColor("#FFC983")},
        {QColor("#262C45"), QColor("#B9C3FF")},
        {QColor("#3A1A1A"), QColor("#FF8F8F")},
        {QColor("#2A2447"), QColor("#C5B5FF")},
    };
    return palette;
}

QPair<QColor, QColor> avatarFor(const QString& title)
{
    uint hash = 0;
    for (const auto ch : title) {
        hash = hash * 31 + ch.unicode();
    }
    return avatarPalette().at(hash % avatarPalette().size());
}

QString avatarLetter(const QString& title, const QString& user)
{
    for (const auto ch : title) {
        if (ch.isLetter()) {
            return QString(ch).toUpper();
        }
    }
    for (const auto ch : user) {
        if (ch.isLetter()) {
            return QString(ch).toUpper();
        }
    }
    for (const auto ch : title) {
        if (ch.isLetterOrNumber()) {
            return QString(ch).toUpper();
        }
    }
    return QStringLiteral("K");
}

QString prettyType(const QString& type)
{
    if (type == QStringLiteral("totp")) {
        return QStringLiteral("TOTP");
    }
    return type.left(1).toUpper() + type.mid(1);
}

void setLabelRole(QLabel* label, const char* name)
{
    label->setObjectName(QString::fromLatin1(name));
}

void clearLayout(QLayout* layout)
{
    while (auto* item = layout->takeAt(0)) {
        if (auto* widget = item->widget()) {
            widget->hide();
            widget->deleteLater();
            delete item;
        } else if (auto* child = item->layout()) {
            clearLayout(child);
            delete child;
        } else {
            delete item;
        }
    }
}
} // namespace

class TitleBar : public QWidget
{
public:
    using QWidget::QWidget;

protected:
    void mousePressEvent(QMouseEvent* event) override
    {
        if (event->button() == Qt::LeftButton) {
            if (auto* handle = window()->windowHandle()) {
                handle->startSystemMove();
            }
        }
    }

    void mouseDoubleClickEvent(QMouseEvent* event) override
    {
        if (event->button() == Qt::LeftButton) {
            if (window()->isMaximized()) {
                window()->showNormal();
            } else {
                window()->showMaximized();
            }
        }
    }
};

class UnlockDialog : public QDialog
{
public:
    UnlockDialog(const QString& fileName, QWidget* parent)
        : QDialog(parent)
    {
        setWindowTitle(tr("Unlock vault"));
        setMinimumWidth(380);
        auto* layout = new QVBoxLayout(this);
        layout->setContentsMargins(24, 24, 24, 20);
        layout->setSpacing(10);

        auto* title = new QLabel(tr("Unlock vault"));
        setLabelRole(title, "dialogTitle");
        auto* sub = new QLabel(fileName);
        setLabelRole(sub, "mutedLabel");
        m_password = new QLineEdit();
        m_password->setEchoMode(QLineEdit::Password);
        m_password->setPlaceholderText(tr("Master password"));
        auto* show = new QCheckBox(tr("Show password"));
        connect(show, &QCheckBox::toggled, this, [this](bool on) {
            m_password->setEchoMode(on ? QLineEdit::Normal : QLineEdit::Password);
        });

        auto* buttons = new QHBoxLayout();
        buttons->addStretch();
        auto* cancel = new QPushButton(tr("Cancel"));
        auto* unlock = new QPushButton(tr("Unlock"));
        unlock->setObjectName("primary");
        unlock->setDefault(true);
        connect(cancel, &QPushButton::clicked, this, &QDialog::reject);
        connect(unlock, &QPushButton::clicked, this, &QDialog::accept);
        connect(m_password, &QLineEdit::returnPressed, this, &QDialog::accept);
        buttons->addWidget(cancel);
        buttons->addWidget(unlock);

        layout->addWidget(title);
        layout->addWidget(sub);
        layout->addSpacing(6);
        layout->addWidget(m_password);
        layout->addWidget(show);
        layout->addSpacing(6);
        layout->addLayout(buttons);
        m_password->setFocus();
    }

    QString password() const
    {
        return m_password->text();
    }

private:
    QLineEdit* m_password = nullptr;
};

class WindowButton : public QPushButton
{
public:
    enum class Kind
    {
        Minimize,
        Maximize,
        Restore,
        Close
    };

    explicit WindowButton(Kind kind, QWidget* parent = nullptr)
        : QPushButton(parent)
        , m_kind(kind)
    {
        setFixedSize(42, 30);
        setFlat(true);
        setCursor(Qt::PointingHandCursor);
        setFocusPolicy(Qt::NoFocus);
        setAttribute(Qt::WA_Hover, true);
    }

    void setKind(Kind kind)
    {
        m_kind = kind;
        update();
    }

protected:
    void enterEvent(QEnterEvent* event) override
    {
        QPushButton::enterEvent(event);
        update();
    }

    void leaveEvent(QEvent* event) override
    {
        QPushButton::leaveEvent(event);
        update();
    }

    void paintEvent(QPaintEvent*) override
    {
        QPainter p(this);
        p.setRenderHint(QPainter::Antialiasing);
        const bool close = m_kind == Kind::Close;
        if (underMouse()) {
            p.fillRect(rect(), close ? QColor("#C42B1C") : QColor("#16282B"));
        }
        const QColor color = (close && underMouse()) ? QColor("#FFFFFF") : QColor("#C7D6D3");
        QPen pen(color, 1.2);
        pen.setCapStyle(Qt::RoundCap);
        p.setPen(pen);
        const qreal cx = width() / 2.0;
        const qreal cy = height() / 2.0;

        if (m_kind == Kind::Minimize) {
            p.drawLine(QPointF(cx - 5, cy), QPointF(cx + 5, cy));
        } else if (m_kind == Kind::Maximize) {
            p.drawRect(QRectF(cx - 4.5, cy - 4.5, 9, 9));
        } else if (m_kind == Kind::Restore) {
            p.drawRect(QRectF(cx - 5.5, cy - 3.5, 9, 9));
            p.drawRect(QRectF(cx - 2.5, cy - 6.5, 9, 9));
        } else {
            p.drawLine(QPointF(cx - 4, cy - 4), QPointF(cx + 4, cy + 4));
            p.drawLine(QPointF(cx + 4, cy - 4), QPointF(cx - 4, cy + 4));
        }
    }

private:
    Kind m_kind;
};

QPixmap makeLogoPixmap(int size)
{
    QPixmap pm(size, size);
    pm.fill(Qt::transparent);
    QPainter p(&pm);
    p.setRenderHint(QPainter::Antialiasing);
    p.setPen(Qt::NoPen);
    p.setBrush(QColor("#123A33"));
    p.drawRoundedRect(QRectF(0.5, 0.5, size - 1, size - 1), size * 0.28, size * 0.28);
    QPen pen(QColor("#2FBF8A"), qMax(1.6, size / 18.0));
    pen.setCapStyle(Qt::RoundCap);
    p.setPen(pen);
    const qreal cx = size / 2.0;
    const qreal cy = size / 2.0;
    const qreal r = size * 0.13;
    p.drawEllipse(QPointF(cx, cy - size * 0.05), r, r);
    p.drawLine(QPointF(cx, cy + r * 0.4), QPointF(cx, cy + size * 0.18));
    return pm;
}

class EntryDialog : public QDialog
{
public:
    EntryDialog(const QString& type, Entry* entry, QWidget* parent)
        : QDialog(parent)
        , m_type(type)
    {
        setWindowTitle(entry ? tr("Edit item") : tr("New %1").arg(type));
        setMinimumWidth(460);

        auto* layout = new QVBoxLayout(this);
        layout->setContentsMargins(24, 24, 24, 20);
        layout->setSpacing(14);
        auto* form = new QFormLayout();
        form->setLabelAlignment(Qt::AlignLeft);
        form->setHorizontalSpacing(16);
        form->setVerticalSpacing(10);

        m_title = addField(form, tr("Title"), entry ? entry->title() : QString());
        m_username = addField(form, tr("Username"), entry ? entry->username() : QString());
        m_url = addField(form, tr("Website"), entry ? entry->url() : QString());
        m_password = addField(form, tr("Password"), entry ? entry->password() : QString(), true);
        m_secret = addField(form, tr("TOTP secret"), entry && entry->totpSettings() ? entry->totpSettings()->key : QString());
        m_holder = addField(form, tr("Cardholder"), entry ? entry->attributes()->value(CARD_HOLDER) : QString());
        m_number = addField(form, tr("Card number"), entry ? entry->attributes()->value(CARD_NUMBER) : QString());
        m_expiry = addField(form, tr("Expiry (MM/YY)"), entry ? entry->attributes()->value(CARD_EXPIRY) : QString());
        m_cvv = addField(form, tr("CVV"), entry ? entry->attributes()->value(CARD_CVV) : QString());
        m_rpId = addField(form, tr("Relying party"), entry ? entry->attributes()->value(EntryAttributes::KPEX_PASSKEY_RELYING_PARTY) : QString());
        m_credentialId = addField(form, tr("Credential ID"), entry ? entry->attributes()->value(EntryAttributes::KPEX_PASSKEY_CREDENTIAL_ID) : QString());
        m_privateKey = addField(form, tr("Private key"), entry ? entry->attributes()->value(EntryAttributes::KPEX_PASSKEY_PRIVATE_KEY_PEM) : QString());
        m_tags = addField(form, tr("Tags"), entry ? entry->tagList().join(QStringLiteral(", ")) : QString());

        m_notes = new QTextEdit();
        m_notes->setPlainText(entry ? entry->notes() : QString());
        m_notes->setMinimumHeight(70);
        form->addRow(tr("Notes"), m_notes);

        layout->addLayout(form);

        auto* buttons = new QHBoxLayout();
        buttons->addStretch();
        auto* cancel = new QPushButton(tr("Cancel"));
        auto* save = new QPushButton(tr("Save"));
        save->setObjectName("primary");
        connect(cancel, &QPushButton::clicked, this, &QDialog::reject);
        connect(save, &QPushButton::clicked, this, &QDialog::accept);
        buttons->addWidget(cancel);
        buttons->addWidget(save);
        layout->addLayout(buttons);

        // setRowVisible hides the label together with the field (setVisible left orphan labels behind).
        form->setRowVisible(m_username, type != QStringLiteral("Card"));
        form->setRowVisible(m_url, type == QStringLiteral("Password"));
        form->setRowVisible(m_password, type == QStringLiteral("Password"));
        form->setRowVisible(m_secret, type == QStringLiteral("TOTP"));
        form->setRowVisible(m_holder, type == QStringLiteral("Card"));
        form->setRowVisible(m_number, type == QStringLiteral("Card"));
        form->setRowVisible(m_expiry, type == QStringLiteral("Card"));
        form->setRowVisible(m_cvv, type == QStringLiteral("Card"));
        form->setRowVisible(m_rpId, type == QStringLiteral("Passkey"));
        form->setRowVisible(m_credentialId, type == QStringLiteral("Passkey"));
        form->setRowVisible(m_privateKey, type == QStringLiteral("Passkey"));
    }

    void apply(Entry* entry) const
    {
        entry->setTitle(m_title->text().trimmed());
        entry->setUsername(m_username->text());
        entry->setUrl(m_url->text());
        entry->setNotes(m_notes->toPlainText());
        entry->setTags(m_tags->text());

        entry->attributes()->remove(CARD_HOLDER);
        entry->attributes()->remove(CARD_NUMBER);
        entry->attributes()->remove(CARD_EXPIRY);
        entry->attributes()->remove(CARD_CVV);

        if (m_type == QStringLiteral("Password")) {
            entry->setPassword(m_password->text());
        } else if (m_type == QStringLiteral("TOTP")) {
            const auto secret = m_secret->text().trimmed();
            if (!secret.isEmpty()) {
                auto settings = Totp::createSettings(secret);
                const auto error = Totp::checkValidSettings(settings);
                if (error.isEmpty()) {
                    entry->setTotp(settings);
                }
            }
        } else if (m_type == QStringLiteral("Card")) {
            entry->attributes()->set(CARD_HOLDER, m_holder->text());
            entry->attributes()->set(CARD_NUMBER, m_number->text());
            entry->attributes()->set(CARD_EXPIRY, m_expiry->text());
            entry->attributes()->set(CARD_CVV, m_cvv->text());
            entry->addTag(QStringLiteral("Card"));
        } else if (m_type == QStringLiteral("Passkey")) {
            entry->attributes()->set(EntryAttributes::KPEX_PASSKEY_RELYING_PARTY, m_rpId->text());
            entry->attributes()->set(EntryAttributes::KPEX_PASSKEY_CREDENTIAL_ID, m_credentialId->text());
            entry->attributes()->set(EntryAttributes::KPEX_PASSKEY_PRIVATE_KEY_PEM, m_privateKey->text(), true);
            entry->attributes()->set(EntryAttributes::KPEX_PASSKEY_USERNAME, m_username->text());
            entry->addTag(QStringLiteral("Passkey"));
        }
    }

private:
    QLineEdit* addField(QFormLayout* form, const QString& label, const QString& value, bool password = false)
    {
        auto* edit = new QLineEdit(value);
        if (password) {
            edit->setEchoMode(QLineEdit::Password);
        }
        form->addRow(label, edit);
        return edit;
    }

    QString m_type;
    QLineEdit* m_title = nullptr;
    QLineEdit* m_username = nullptr;
    QLineEdit* m_url = nullptr;
    QLineEdit* m_password = nullptr;
    QLineEdit* m_secret = nullptr;
    QLineEdit* m_holder = nullptr;
    QLineEdit* m_number = nullptr;
    QLineEdit* m_expiry = nullptr;
    QLineEdit* m_cvv = nullptr;
    QLineEdit* m_rpId = nullptr;
    QLineEdit* m_credentialId = nullptr;
    QLineEdit* m_privateKey = nullptr;
    QLineEdit* m_tags = nullptr;
    QTextEdit* m_notes = nullptr;
};

PersonalVaultWindow::PersonalVaultWindow(QWidget* parent)
    : QMainWindow(parent)
{
    setWindowFlags(Qt::Window | Qt::FramelessWindowHint);
    buildUi();
    m_sizeGrip = new QSizeGrip(this);
    m_sizeGrip->setFixedSize(16, 16);
    m_sizeGrip->raise();
    m_totpTimer = new QTimer(this);
    m_totpTimer->setInterval(1000);
    connect(m_totpTimer, &QTimer::timeout, this, [this] { updateTotp(); });
    m_totpTimer->start();
    setWindowTitle(tr("Personal Vault"));
    setWindowIcon(QIcon(makeLogoPixmap(64)));
    setMinimumSize(900, 600);
    resize(1200, 760);

    auto bind = [this](const QKeySequence& keys, std::function<void()> fn) {
        auto* shortcut = new QShortcut(keys, this);
        connect(shortcut, &QShortcut::activated, this, std::move(fn));
    };
    bind(QKeySequence::Find, [this] { m_search->setFocus(); m_search->selectAll(); });
    bind(QKeySequence::New, [this] { addItem(); });
    bind(QKeySequence(Qt::CTRL | Qt::Key_L), [this] { lockVault(); });
}

void PersonalVaultWindow::buildUi()
{
    auto* central = new QWidget(this);
    auto* root = new QHBoxLayout(central);
    root->setContentsMargins(0, 0, 0, 0);
    root->setSpacing(0);

    // Sidebar
    auto* sidebar = new QWidget();
    sidebar->setFixedWidth(250);
    sidebar->setObjectName("sidebar");
    auto* sideLayout = new QVBoxLayout(sidebar);
    sideLayout->setContentsMargins(12, 14, 12, 12);
    sideLayout->setSpacing(8);

    auto* vaultHeader = new QWidget();
    auto* vaultHeaderLayout = new QHBoxLayout(vaultHeader);
    vaultHeaderLayout->setContentsMargins(0, 0, 0, 4);
    vaultHeaderLayout->setSpacing(10);
    auto* vaultAvatar = new QLabel();
    vaultAvatar->setObjectName("vaultLogo");
    vaultAvatar->setPixmap(makeLogoPixmap(36));
    vaultAvatar->setFixedSize(36, 36);
    auto* vaultText = new QVBoxLayout();
    vaultText->setContentsMargins(0, 0, 0, 0);
    vaultText->setSpacing(0);
    m_vaultName = new QLabel(tr("Personal Vault"));
    m_vaultName->setObjectName("vaultName");
    m_status = new QLabel(tr("● Locked"));
    m_status->setObjectName("vaultStatus");
    m_status->setProperty("locked", true);
    vaultText->addWidget(m_vaultName);
    vaultText->addWidget(m_status);
    vaultHeaderLayout->addWidget(vaultAvatar);
    vaultHeaderLayout->addLayout(vaultText, 1);
    sideLayout->addWidget(vaultHeader);

    auto* navGroup = new QButtonGroup(this);
    navGroup->setExclusive(true);
    auto nav = [&](const QString& text, const QString& filter) {
        auto* b = new QPushButton(text);
        b->setObjectName("nav");
        b->setCheckable(true);
        b->setChecked(filter == QStringLiteral("all"));
        navGroup->addButton(b);
        m_navButtons.insert(filter, b);
        if (filter == QStringLiteral("all")) {
            m_allButton = b;
        }
        connect(b, &QPushButton::clicked, this, [this, filter] {
            m_filter = filter;
            refreshList();
            refreshCounts();
        });
        sideLayout->addWidget(b);
    };
    nav(tr("All entries"), QStringLiteral("all"));
    nav(tr("Favorites"), QStringLiteral("favorite"));
    auto* catLabel = new QLabel(tr("CATEGORIES"));
    catLabel->setObjectName("sectionLabel");
    sideLayout->addWidget(catLabel);
    nav(tr("Passwords"), QStringLiteral("password"));
    nav(tr("Passkeys"), QStringLiteral("passkey"));
    nav(tr("TOTP"), QStringLiteral("totp"));
    nav(tr("Cards"), QStringLiteral("card"));

    auto* tagsLabel = new QLabel(tr("TAGS"));
    tagsLabel->setObjectName("sectionLabel");
    sideLayout->addWidget(tagsLabel);
    auto* tagsWidget = new QWidget();
    m_tagsLayout = new QHBoxLayout(tagsWidget);
    m_tagsLayout->setContentsMargins(0, 0, 0, 0);
    m_tagsLayout->setSpacing(6);
    sideLayout->addWidget(tagsWidget);

    sideLayout->addStretch();

    auto* healthCard = new QWidget();
    healthCard->setObjectName("healthCard");
    auto* healthLayout = new QHBoxLayout(healthCard);
    healthLayout->setContentsMargins(10, 10, 10, 10);
    healthLayout->setSpacing(10);
    m_healthRing = new QLabel(QStringLiteral("—"));
    m_healthRing->setObjectName("healthRing");
    m_healthRing->setFixedSize(42, 42);
    m_healthRing->setAlignment(Qt::AlignCenter);
    auto* healthText = new QVBoxLayout();
    healthText->setContentsMargins(0, 0, 0, 0);
    healthText->setSpacing(0);
    auto* healthTitle = new QLabel(tr("Vault health"));
    healthTitle->setObjectName("healthTitle");
    m_health = new QLabel(tr("No items"));
    m_health->setObjectName("healthDetail");
    m_health->setWordWrap(true);
    healthText->addWidget(healthTitle);
    healthText->addWidget(m_health);
    healthLayout->addWidget(m_healthRing);
    healthLayout->addLayout(healthText, 1);
    sideLayout->addWidget(healthCard);
    auto* settings = new QPushButton(tr("Settings"));
    settings->setObjectName("nav");
    connect(settings, &QPushButton::clicked, this, &PersonalVaultWindow::showSettingsMenu);
    sideLayout->addWidget(settings);

    root->addWidget(sidebar);

    // Main
    auto* main = new QWidget();
    auto* mainLayout = new QVBoxLayout(main);
    mainLayout->setContentsMargins(0, 0, 0, 0);
    mainLayout->setSpacing(0);

    auto* topbar = new TitleBar();
    topbar->setObjectName("topbar");
    auto* topLayout = new QHBoxLayout(topbar);
    topLayout->setContentsMargins(16, 12, 16, 12);
    m_search = new QLineEdit();
    m_search->setPlaceholderText(tr("Search vault"));
    m_search->setMaximumWidth(320);
    connect(m_search, &QLineEdit::textChanged, this, [this] { refreshList(); });
    auto* add = new QPushButton(tr("+ New item"));
    add->setObjectName("primary");
    connect(add, &QPushButton::clicked, this, &PersonalVaultWindow::addItem);
    auto* lockTop = new QPushButton(tr("Lock"));
    connect(lockTop, &QPushButton::clicked, this, [this] {
        lockVault();
        promptOpen();
    });
    auto* minimize = new WindowButton(WindowButton::Kind::Minimize, topbar);
    minimize->setToolTip(tr("Minimize"));
    auto* maximize = new WindowButton(WindowButton::Kind::Maximize, topbar);
    maximize->setToolTip(tr("Maximize"));
    auto* closeButton = new WindowButton(WindowButton::Kind::Close, topbar);
    closeButton->setToolTip(tr("Close"));
    connect(minimize, &QPushButton::clicked, this, &QWidget::showMinimized);
    connect(maximize, &QPushButton::clicked, this, [this, maximize] {
        if (isMaximized()) {
            showNormal();
            maximize->setKind(WindowButton::Kind::Maximize);
        } else {
            showMaximized();
            maximize->setKind(WindowButton::Kind::Restore);
        }
    });
    connect(closeButton, &QPushButton::clicked, this, &QWidget::close);
    topLayout->addWidget(m_search);
    topLayout->addStretch();
    topLayout->addWidget(add);
    topLayout->addWidget(lockTop);
    topLayout->addSpacing(8);
    topLayout->addWidget(minimize);
    topLayout->addWidget(maximize);
    topLayout->addWidget(closeButton);
    mainLayout->addWidget(topbar);

    auto* splitter = new QSplitter(Qt::Horizontal);
    m_list = new QListWidget();
    m_list->setSpacing(2);
    m_list->setHorizontalScrollBarPolicy(Qt::ScrollBarAlwaysOff);
    connect(m_list, &QListWidget::currentItemChanged, this, [this](QListWidgetItem* item) {
        if (!item) {
            m_current = nullptr;
            clearDetails();
            return;
        }
        m_current = reinterpret_cast<Entry*>(item->data(Qt::UserRole).toULongLong());
        showDetails(m_current);
    });

    auto* listPane = new QWidget();
    auto* listLayout = new QVBoxLayout(listPane);
    listLayout->setContentsMargins(0, 0, 0, 0);
    listLayout->setSpacing(0);
    auto* listHeader = new QWidget();
    listHeader->setObjectName("listHeader");
    auto* headerLayout = new QHBoxLayout(listHeader);
    headerLayout->setContentsMargins(10, 6, 10, 6);
    headerLayout->setSpacing(10);
    headerLayout->addSpacing(44);
    auto* nameHeader = new QLabel(tr("NAME"));
    nameHeader->setObjectName("listHeaderLabel");
    headerLayout->addWidget(nameHeader, 1);
    auto* userHeader = new QLabel(tr("USERNAME"));
    userHeader->setObjectName("listHeaderLabel");
    userHeader->setFixedWidth(220);
    headerLayout->addWidget(userHeader);
    auto* updatedHeader = new QLabel(tr("UPDATED"));
    updatedHeader->setObjectName("listHeaderLabel");
    updatedHeader->setFixedWidth(70);
    updatedHeader->setAlignment(Qt::AlignRight | Qt::AlignVCenter);
    headerLayout->addWidget(updatedHeader);
    listLayout->addWidget(listHeader);
    listLayout->addWidget(m_list, 1);
    splitter->addWidget(listPane);

    auto* scroll = new QScrollArea();
    scroll->setWidgetResizable(true);
    scroll->setHorizontalScrollBarPolicy(Qt::ScrollBarAlwaysOff);
    scroll->setAlignment(Qt::AlignTop);
    scroll->setMinimumWidth(340);
    scroll->setMaximumWidth(430);
    m_details = new QWidget();
    m_detailsLayout = new QVBoxLayout(m_details);
    m_detailsLayout->setContentsMargins(18, 18, 18, 18);
    m_detailsLayout->setSpacing(10);
    scroll->setWidget(m_details);
    splitter->addWidget(scroll);
    splitter->setStretchFactor(0, 1);
    splitter->setStretchFactor(1, 0);
    splitter->setSizes({760, 380});
    mainLayout->addWidget(splitter, 1);

    root->addWidget(main, 1);
    setCentralWidget(central);
    refresh();
}

void PersonalVaultWindow::addRecent(const QString& path)
{
    QSettings settings;
    auto list = settings.value(QStringLiteral("recentVaults")).toStringList();
    list.removeAll(path);
    list.prepend(path);
    while (list.size() > 8) {
        list.removeLast();
    }
    settings.setValue(QStringLiteral("recentVaults"), list);
}

QStringList PersonalVaultWindow::recentFiles() const
{
    QSettings settings;
    return settings.value(QStringLiteral("recentVaults")).toStringList();
}

void PersonalVaultWindow::openLastVault()
{
    for (const auto& path : recentFiles()) {
        if (QFileInfo::exists(path)) {
            openVault(path);
            return;
        }
    }
    promptOpen();
}

void PersonalVaultWindow::showSettingsMenu()
{
    QMenu menu(this);
    auto* open = menu.addAction(tr("Open vault…"));
    auto* recent = menu.addMenu(tr("Recent vaults"));
    for (const auto& path : recentFiles()) {
        if (!QFileInfo::exists(path)) {
            continue;
        }
        auto* action = recent->addAction(QFileInfo(path).fileName());
        action->setToolTip(path);
        connect(action, &QAction::triggered, this, [this, path] { openVault(path); });
    }
    if (recent->isEmpty()) {
        recent->addAction(tr("No recent vaults"))->setEnabled(false);
    }
    menu.addSeparator();
    auto* import = menu.addAction(tr("Import Bitwarden…"));
    auto* lock = menu.addAction(tr("Lock"));
    auto* chosen = menu.exec(QCursor::pos());
    if (chosen == open) {
        promptOpen();
    } else if (chosen == import) {
        importBitwarden();
    } else if (chosen == lock) {
        lockVault();
    }
}

void PersonalVaultWindow::resizeEvent(QResizeEvent* event)
{
    QMainWindow::resizeEvent(event);
    if (m_sizeGrip) {
        m_sizeGrip->move(width() - 18, height() - 18);
        m_sizeGrip->raise();
    }
}

void PersonalVaultWindow::promptOpen()
{
    const auto path = QFileDialog::getOpenFileName(this,
                                                   tr("Open database"),
                                                   QString(),
                                                   tr("KeePass databases (*.kdbx);;All files (*)"));
    if (!path.isEmpty()) {
        openVault(path);
    }
}

void PersonalVaultWindow::lockVault()
{
    browserService()->setExternalDatabase({});
    m_db.clear();
    m_current = nullptr;
    if (m_list) {
        m_list->clear();
    }
    clearDetails();
    refresh();
}

void PersonalVaultWindow::attachDatabase(const QSharedPointer<Database>& db, const QString& path)
{
    m_current = nullptr;
    m_tag.clear();
    if (m_list) {
        m_list->clear();
    }
    clearDetails();
    m_db = db;
    m_vaultName->setText(tr("Personal Vault"));
    m_vaultName->setToolTip(path);
    addRecent(path);
    browserSettings()->setSearchInAllDatabases(false);
    browserService()->setExternalDatabase(m_db);
    browserSettings()->setEnabled(true);
    browserService()->setEnabled(true);
    connect(m_db.data(), &Database::modified, this, &PersonalVaultWindow::saveDatabase, Qt::QueuedConnection);
    refresh();
}

bool PersonalVaultWindow::openVault(const QString& path)
{
    UnlockDialog dialog(QFileInfo(path).fileName(), this);
    if (dialog.exec() != QDialog::Accepted) {
        return false;
    }

    auto key = QSharedPointer<CompositeKey>::create();
    key->addKey(QSharedPointer<PasswordKey>::create(dialog.password()));
    auto db = QSharedPointer<Database>::create(path);
    QString error;
    if (!db->open(key, &error)) {
        QMessageBox::warning(this, tr("Could not open database"), error);
        return false;
    }
    attachDatabase(db, path);
    return true;
}

bool PersonalVaultWindow::openVaultWithPassword(const QString& path, const QString& password)
{
    auto key = QSharedPointer<CompositeKey>::create();
    key->addKey(QSharedPointer<PasswordKey>::create(password));
    auto db = QSharedPointer<Database>::create(path);
    QString error;
    if (!db->open(key, &error)) {
        return false;
    }
    attachDatabase(db, path);
    return true;
}

QString PersonalVaultWindow::typeOf(const Entry* entry) const
{
    if (entry->hasPasskey()) {
        return QStringLiteral("passkey");
    }
    if (entry->hasTotp()) {
        return QStringLiteral("totp");
    }
    if (entry->attributes()->hasKey(CARD_NUMBER) || entry->tagList().contains(QStringLiteral("Card"), Qt::CaseInsensitive)) {
        return QStringLiteral("card");
    }
    return QStringLiteral("password");
}

QString PersonalVaultWindow::primaryUser(const Entry* entry) const
{
    if (typeOf(entry) == QStringLiteral("card")) {
        return entry->attributes()->value(CARD_HOLDER);
    }
    return entry->username();
}

QString PersonalVaultWindow::updatedText(const Entry* entry) const
{
    return entry->timeInfo().lastModificationTime().toString(QStringLiteral("MMM d"));
}

bool PersonalVaultWindow::isWeak(const Entry* entry) const
{
    if (typeOf(entry) != QStringLiteral("password") || entry->password().isEmpty()) {
        return false;
    }
    const auto p = entry->password();
    return p.length() < 10 || p.toUpper() == p || !p.contains(QRegularExpression(QStringLiteral("[0-9]")));
}

bool PersonalVaultWindow::matches(const Entry* entry) const
{
    if (!m_tag.isEmpty() && !entry->tagList().contains(m_tag, Qt::CaseInsensitive)) {
        return false;
    }
    if (m_filter == QStringLiteral("favorite")
        && !entry->tagList().contains(QStringLiteral("Favorite"), Qt::CaseInsensitive)) {
        return false;
    }
    if (m_filter != QStringLiteral("all") && m_filter != QStringLiteral("favorite") && typeOf(entry) != m_filter) {
        return false;
    }
    const auto query = m_search ? m_search->text().trimmed() : QString();
    if (query.isEmpty()) {
        return true;
    }
    return entry->title().contains(query, Qt::CaseInsensitive)
           || entry->username().contains(query, Qt::CaseInsensitive)
           || entry->url().contains(query, Qt::CaseInsensitive);
}

void PersonalVaultWindow::refresh()
{
    refreshCounts();
    refreshList();
    refreshCounts();
    m_status->setText(m_db ? tr("● Unlocked") : tr("● Locked"));
    m_status->setProperty("locked", !m_db);
    m_status->style()->unpolish(m_status);
    m_status->style()->polish(m_status);
    if (!m_db) {
        clearDetails();
    }
}

void PersonalVaultWindow::refreshCounts()
{
    int all = 0, password = 0, passkey = 0, totp = 0, card = 0, weak = 0, favorite = 0;
    QStringList tags;
    if (m_db) {
        for (const auto* entry : m_db->rootGroup()->entriesRecursive()) {
            all++;
            const auto type = typeOf(entry);
            if (type == QStringLiteral("password")) password++;
            else if (type == QStringLiteral("passkey")) passkey++;
            else if (type == QStringLiteral("totp")) totp++;
            else if (type == QStringLiteral("card")) card++;
            if (isWeak(entry)) weak++;
            if (entry->tagList().contains(QStringLiteral("Favorite"), Qt::CaseInsensitive)) favorite++;
            for (const auto& tag : entry->tagList()) {
                if (!tags.contains(tag)) {
                    tags << tag;
                }
            }
        }
    }

    const auto setText = [this](const QString& filter, const QString& text) {
        if (auto* button = m_navButtons.value(filter)) {
            button->setText(text);
        }
    };
    setText(QStringLiteral("all"), tr("All entries (%1)").arg(all));
    setText(QStringLiteral("favorite"), tr("Favorites (%1)").arg(favorite));
    setText(QStringLiteral("password"), tr("Passwords (%1)").arg(password));
    setText(QStringLiteral("passkey"), tr("Passkeys (%1)").arg(passkey));
    setText(QStringLiteral("totp"), tr("TOTP (%1)").arg(totp));
    setText(QStringLiteral("card"), tr("Cards (%1)").arg(card));

    if (m_tagsLayout) {
        clearLayout(m_tagsLayout);
        tags.sort();
        if (tags.isEmpty()) {
            auto* none = new QLabel(tr("No tags"));
            none->setObjectName("mutedLabel");
            m_tagsLayout->addWidget(none);
        }
        for (const auto& tag : tags) {
            auto* chip = new QPushButton(tag);
            chip->setObjectName("tag");
            chip->setCheckable(true);
            chip->setChecked(tag == m_tag);
            connect(chip, &QPushButton::clicked, this, [this, tag] {
                m_tag = (m_tag == tag) ? QString() : tag;
                m_filter = QStringLiteral("all");
                refreshList();
                refreshCounts();
            });
            m_tagsLayout->addWidget(chip);
        }
        m_tagsLayout->addStretch();
    }

    if (m_healthRing) {
        const int score = all > 0 ? qMax(0, 100 - (weak * 100 / all)) : 100;
        m_healthRing->setText(QString::number(score));
        const auto color = score >= 80 ? QStringLiteral("#2FBF8A")
                                        : (score >= 60 ? QStringLiteral("#F5B454") : QStringLiteral("#FF8F8F"));
        m_healthRing->setStyleSheet(
            QStringLiteral("border:3px solid %1;border-radius:21px;color:#E4F0EE;font-weight:700;").arg(color));
    }
    if (m_health) {
        m_health->setText(tr("%1 weak · %2 items").arg(weak).arg(all));
    }
}

void PersonalVaultWindow::refreshList()
{
    if (!m_list) {
        return;
    }
    const auto currentId = m_current ? m_current->uuid() : QUuid();
    m_list->clear();
    if (!m_db) {
        return;
    }

    QList<Entry*> entries = m_db->rootGroup()->entriesRecursive();
    std::sort(entries.begin(), entries.end(), [](Entry* a, Entry* b) {
        return a->title().localeAwareCompare(b->title()) < 0;
    });

    for (auto* entry : entries) {
        if (!matches(entry)) {
            continue;
        }
        auto* item = new QListWidgetItem(m_list);
        item->setData(Qt::UserRole, static_cast<qulonglong>(reinterpret_cast<quintptr>(entry)));
        item->setSizeHint(QSize(0, 56));

        auto* row = new QWidget();
        auto* rowLayout = new QHBoxLayout(row);
        rowLayout->setContentsMargins(10, 6, 10, 6);
        rowLayout->setSpacing(10);

        const auto title = entry->title().isEmpty() ? tr("Untitled") : entry->title();
        const auto userText = primaryUser(entry);
        const auto [bg, fg] = avatarFor(title);
        auto* avatar = new QLabel(avatarLetter(title, userText));
        avatar->setObjectName("avatar");
        avatar->setAlignment(Qt::AlignCenter);
        avatar->setFixedSize(34, 34);
        avatar->setStyleSheet(QStringLiteral("background:%1;color:%2;border-radius:9px;font-weight:700;").arg(bg.name(), fg.name()));
        rowLayout->addWidget(avatar);

        auto* textLayout = new QVBoxLayout();
        textLayout->setContentsMargins(0, 0, 0, 0);
        textLayout->setSpacing(0);
        auto* titleLabel = new ElidedLabel();
        titleLabel->setObjectName("rowTitle");
        titleLabel->setRawText(entry->tagList().contains(QStringLiteral("Favorite"), Qt::CaseInsensitive)
                                   ? QStringLiteral("★ ") + title
                                   : title);
        titleLabel->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Preferred);
        auto* subLabel = new QLabel(prettyType(typeOf(entry)));
        subLabel->setObjectName("rowSub");
        textLayout->addWidget(titleLabel);
        textLayout->addWidget(subLabel);
        rowLayout->addLayout(textLayout, 1);

        auto* user = new ElidedLabel();
        user->setObjectName("rowUser");
        user->setRawText(userText);
        user->setFixedWidth(220);
        rowLayout->addWidget(user);

        auto* date = new QLabel(updatedText(entry));
        date->setObjectName("rowDate");
        date->setFixedWidth(70);
        date->setAlignment(Qt::AlignRight | Qt::AlignVCenter);
        rowLayout->addWidget(date);

        m_list->setItemWidget(item, row);
        if (entry->uuid() == currentId) {
            m_list->setCurrentItem(item);
        }
    }

    if (m_list->count() > 0 && m_list->currentRow() < 0) {
        m_list->setCurrentRow(0);
    } else if (m_list->count() == 0) {
        m_current = nullptr;
        clearDetails();
    }
}

void PersonalVaultWindow::clearDetails()
{
    m_totpLabel = nullptr;
    if (!m_detailsLayout) {
        return;
    }
    clearLayout(m_detailsLayout);
    auto* empty = new QLabel(m_db ? tr("Select an item") : tr("Vault is locked"));
    empty->setObjectName("mutedLabel");
    empty->setAlignment(Qt::AlignCenter);
    m_detailsLayout->addWidget(empty);
    if (!m_db) {
        auto* open = new QPushButton(tr("Open vault"));
        open->setObjectName("primary");
        connect(open, &QPushButton::clicked, this, [this] { openLastVault(); });
        m_detailsLayout->addWidget(open);
    }
    m_detailsLayout->addStretch();
}

void PersonalVaultWindow::showDetails(Entry* entry)
{
    clearDetails();
    if (!entry || !m_detailsLayout) {
        return;
    }

    const auto title = entry->title().isEmpty() ? tr("Untitled") : entry->title();
    const auto [bg, fg] = avatarFor(title);

    auto* head = new QWidget();
    auto* headLayout = new QHBoxLayout(head);
    headLayout->setContentsMargins(0, 0, 0, 0);
    auto* avatar = new QLabel(avatarLetter(title, primaryUser(entry)));
    avatar->setObjectName("avatar");
    avatar->setAlignment(Qt::AlignCenter);
    avatar->setFixedSize(48, 48);
    avatar->setStyleSheet(QStringLiteral("background:%1;color:%2;border-radius:12px;font-size:18px;font-weight:700;").arg(bg.name(), fg.name()));
    headLayout->addWidget(avatar);

    auto* headText = new QVBoxLayout();
    auto* titleLabel = new ElidedLabel();
    titleLabel->setObjectName("detailTitle");
    titleLabel->setRawText(title);
    titleLabel->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Preferred);
    auto* subLabel = new ElidedLabel();
    subLabel->setObjectName("detailSub");
    const auto subText = entry->url().isEmpty() ? primaryUser(entry) : entry->url();
    subLabel->setRawText(subText);
    subLabel->setToolTip(subText);
    subLabel->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Preferred);
    headText->addWidget(titleLabel);
    headText->addWidget(subLabel);
    headLayout->addLayout(headText, 1);

    auto* favorite = new QPushButton(entry->tagList().contains(QStringLiteral("Favorite"), Qt::CaseInsensitive)
                                         ? QStringLiteral("★")
                                         : QStringLiteral("☆"));
    favorite->setObjectName("ghost");
    favorite->setFixedWidth(34);
    connect(favorite, &QPushButton::clicked, this, [this, entry] { toggleFavorite(entry); });
    headLayout->addWidget(favorite);
    m_detailsLayout->addWidget(head);

    const auto type = typeOf(entry);
    auto* typeLabel = new QLabel(type.toUpper());
    typeLabel->setObjectName("typeBadge");
    m_detailsLayout->addWidget(typeLabel);

    auto addField = [this](const QString& label, const QString& value, bool copy, const QString& copyValue = QString()) {
        auto* box = new QWidget();
        auto* layout = new QVBoxLayout(box);
        layout->setContentsMargins(0, 0, 0, 0);
        layout->setSpacing(4);
        auto* caption = new QLabel(label.toUpper());
        caption->setObjectName("fieldLabel");
        auto* row = new QHBoxLayout();
        auto* text = new QLabel(value.isEmpty() ? QStringLiteral("—") : value);
        text->setObjectName("fieldValue");
        text->setWordWrap(true);
        text->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Preferred);
        text->setMinimumWidth(0);
        text->setTextInteractionFlags(Qt::TextSelectableByMouse);
        row->addWidget(text, 1);
        if (copy) {
            auto* button = new QPushButton(tr("Copy"));
            button->setFixedWidth(56);
            const auto toCopy = copyValue.isNull() ? value : copyValue;
            connect(button, &QPushButton::clicked, this, [this, toCopy, label] { copyText(toCopy, label); });
            row->addWidget(button);
        }
        layout->addWidget(caption);
        layout->addLayout(row);
        m_detailsLayout->addWidget(box);
    };

    if (type == QStringLiteral("password")) {
        addField(tr("Username"), entry->username(), true);
        addField(tr("Password"), QStringLiteral("••••••••••••"), true, entry->password());
        auto* strength = new QLabel(isWeak(entry) ? tr("WEAK") : tr("STRONG"));
        strength->setObjectName(isWeak(entry) ? "strengthWeak" : "strengthStrong");
        m_detailsLayout->addWidget(strength);
    } else if (type == QStringLiteral("totp")) {
        addField(tr("Username"), entry->username(), true);
        m_totpLabel = new QLabel(entry->totp());
        m_totpLabel->setObjectName("totpCode");
        auto* box = new QWidget();
        auto* layout = new QVBoxLayout(box);
        layout->setContentsMargins(0, 0, 0, 0);
        auto* caption = new QLabel(tr("TOTP CODE"));
        caption->setObjectName("fieldLabel");
        layout->addWidget(caption);
        layout->addWidget(m_totpLabel);
        m_detailsLayout->addWidget(box);
    } else if (type == QStringLiteral("card")) {
        addField(tr("Cardholder"), entry->attributes()->value(CARD_HOLDER), true);
        const auto number = entry->attributes()->value(CARD_NUMBER);
        addField(tr("Card number"),
                 number.isEmpty() ? QString() : QStringLiteral("•••• •••• •••• %1").arg(number.right(4)),
                 true,
                 number);
        addField(tr("Expiry"), entry->attributes()->value(CARD_EXPIRY), false);
        addField(tr("CVV"), QStringLiteral("•••"), false);
    } else if (type == QStringLiteral("passkey")) {
        addField(tr("Username"), entry->attributes()->value(EntryAttributes::KPEX_PASSKEY_USERNAME), true);
        addField(tr("Relying party"), entry->attributes()->value(EntryAttributes::KPEX_PASSKEY_RELYING_PARTY), true);
        addField(tr("Credential ID"), entry->attributes()->value(EntryAttributes::KPEX_PASSKEY_CREDENTIAL_ID), true);
    }

    if (!entry->notes().isEmpty()) {
        addField(tr("Notes"), entry->notes(), true);
    }

    auto* copyMain = new QPushButton(type == QStringLiteral("password") ? tr("Copy password")
                                     : type == QStringLiteral("totp") ? tr("Copy code")
                                     : type == QStringLiteral("card") ? tr("Copy card number")
                                                                     : tr("Copy credential ID"));
    copyMain->setObjectName("primary");
    copyMain->setMinimumHeight(38);
    copyMain->setSizePolicy(QSizePolicy::Expanding, QSizePolicy::Fixed);
    connect(copyMain, &QPushButton::clicked, this, [this, entry, type] {
        if (type == QStringLiteral("password")) {
            copyText(entry->password(), tr("Password"));
        } else if (type == QStringLiteral("totp")) {
            copyText(m_totpLabel ? m_totpLabel->text() : QString(), tr("TOTP code"));
        } else if (type == QStringLiteral("card")) {
            copyText(entry->attributes()->value(CARD_NUMBER), tr("Card number"));
        } else {
            copyText(entry->attributes()->value(EntryAttributes::KPEX_PASSKEY_CREDENTIAL_ID), tr("Credential ID"));
        }
    });
    m_detailsLayout->addWidget(copyMain);

    auto* actions = new QHBoxLayout();
    auto* edit = new QPushButton(tr("Edit"));
    auto* del = new QPushButton(tr("Delete"));
    del->setObjectName("danger");
    connect(edit, &QPushButton::clicked, this, [this, entry] { editItem(entry); });
    connect(del, &QPushButton::clicked, this, [this, entry] { deleteItem(entry); });
    actions->addWidget(edit);
    actions->addWidget(del);
    actions->addStretch();
    m_detailsLayout->addLayout(actions);
    m_detailsLayout->addStretch();
}

void PersonalVaultWindow::addItem()
{
    if (!m_db) {
        promptOpen();
        return;
    }
    QMenu menu(this);
    const QStringList types = {QStringLiteral("Password"), QStringLiteral("Passkey"), QStringLiteral("TOTP"), QStringLiteral("Card")};
    for (const auto& type : types) {
        auto* action = menu.addAction(type);
        connect(action, &QAction::triggered, this, [this, type] {
            EntryDialog dialog(type, nullptr, this);
            if (dialog.exec() != QDialog::Accepted) {
                return;
            }
            auto* entry = new Entry();
            entry->setGroup(m_db->rootGroup());
            dialog.apply(entry);
            if (entry->title().isEmpty()) {
                entry->setTitle(type + tr(" item"));
            }
            m_db->markAsModified();
            saveDatabase();
            m_current = entry;
            refresh();
            showDetails(entry);
        });
    }
    menu.exec(QCursor::pos());
}

void PersonalVaultWindow::editItem(Entry* entry)
{
    if (!entry || !m_db) {
        return;
    }
    QString type;
    const auto t = typeOf(entry);
    if (t == QStringLiteral("password")) type = QStringLiteral("Password");
    else if (t == QStringLiteral("passkey")) type = QStringLiteral("Passkey");
    else if (t == QStringLiteral("totp")) type = QStringLiteral("TOTP");
    else type = QStringLiteral("Card");

    EntryDialog dialog(type, entry, this);
    if (dialog.exec() != QDialog::Accepted) {
        return;
    }
    entry->beginUpdate();
    dialog.apply(entry);
    entry->endUpdate();
    m_db->markAsModified();
    saveDatabase();
    refresh();
    showDetails(entry);
}

void PersonalVaultWindow::deleteItem(Entry* entry)
{
    if (!entry || !m_db) {
        return;
    }
    if (QMessageBox::question(this, tr("Delete item"), tr("Delete “%1”?").arg(entry->title()))
        != QMessageBox::Yes) {
        return;
    }
    m_db->recycleEntry(entry);
    m_current = nullptr;
    saveDatabase();
    refresh();
    clearDetails();
}

void PersonalVaultWindow::toggleFavorite(Entry* entry)
{
    if (!entry) {
        return;
    }
    if (entry->tagList().contains(QStringLiteral("Favorite"), Qt::CaseInsensitive)) {
        entry->removeTag(QStringLiteral("Favorite"));
    } else {
        entry->addTag(QStringLiteral("Favorite"));
    }
    m_db->markAsModified();
    saveDatabase();
    refreshList();
    showDetails(entry);
}

void PersonalVaultWindow::importBitwarden()
{
    const auto path = QFileDialog::getOpenFileName(this,
                                                   tr("Import Bitwarden export"),
                                                   QString(),
                                                   tr("Bitwarden JSON (*.json);;All files (*)"));
    if (path.isEmpty()) {
        return;
    }
    bool ok = false;
    const auto password = QInputDialog::getText(this,
                                                tr("Bitwarden export"),
                                                tr("Export password (leave empty if unencrypted)"),
                                                QLineEdit::Password,
                                                QString(),
                                                &ok);
    if (!ok) {
        return;
    }

    BitwardenReader reader;
    auto imported = reader.convert(path, password);
    if (!imported || reader.hasError()) {
        QMessageBox::warning(this, tr("Import failed"), reader.errorString());
        return;
    }

    const auto target = QFileDialog::getSaveFileName(this,
                                                     tr("Save imported vault"),
                                                     QStringLiteral("bitwarden-import.kdbx"),
                                                     tr("KeePass databases (*.kdbx)"));
    if (target.isEmpty()) {
        return;
    }
    bool ok2 = false;
    const auto newPassword = QInputDialog::getText(this,
                                                   tr("New vault password"),
                                                   tr("Master password for the imported vault"),
                                                   QLineEdit::Password,
                                                   QString(),
                                                   &ok2);
    if (!ok2 || newPassword.isEmpty()) {
        return;
    }

    auto key = QSharedPointer<CompositeKey>::create();
    key->addKey(QSharedPointer<PasswordKey>::create(newPassword));
    imported->setKey(key);
    QString error;
    if (!imported->saveAs(target, Database::Atomic, QString(), &error)) {
        QMessageBox::warning(this, tr("Save failed"), error);
        return;
    }
    QMessageBox::information(this, tr("Import complete"), tr("Saved %1").arg(target));
    openVault(target);
}

void PersonalVaultWindow::copyText(const QString& text, const QString& label)
{
    QApplication::clipboard()->setText(text);
    statusBar()->showMessage(tr("%1 copied").arg(label), 2000);
}

void PersonalVaultWindow::saveDatabase()
{
    if (!m_db) {
        return;
    }
    QString error;
    if (!m_db->save(Database::Atomic, QString(), &error)) {
        QMessageBox::warning(this, tr("Save failed"), error);
    }
}

void PersonalVaultWindow::updateTotp()
{
    if (m_current && m_totpLabel && typeOf(m_current) == QStringLiteral("totp")) {
        m_totpLabel->setText(m_current->totp());
    }
}
