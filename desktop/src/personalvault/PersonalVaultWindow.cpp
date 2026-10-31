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
#include <QGridLayout>
#include <QHBoxLayout>
#include <QInputDialog>
#include <QLabel>
#include <QLineEdit>
#include <QListWidget>
#include <QMenu>
#include <QMessageBox>
#include <QProgressBar>
#include <QPushButton>
#include <QRegularExpression>
#include <QScrollArea>
#include <QCheckBox>
#include <QKeySequence>
#include <QShortcut>
#include <QSizeGrip>
#include <QSlider>
#include <QSpinBox>
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
#include <cmath>
#include <functional>

#include "browser/BrowserService.h"
#include "browser/BrowserSettings.h"
#include "core/Database.h"
#include "core/Entry.h"
#include "core/EntryAttributes.h"
#include "core/Group.h"
#include "core/Metadata.h"
#include "core/PasswordGenerator.h"
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
        {QColor("#3A2B26"), QColor("#F0A58F")},
        {QColor("#1F3040"), QColor("#8FC4F2")},
        {QColor("#33291A"), QColor("#E8C27A")},
        {QColor("#262C47"), QColor("#B7C2FF")},
        {QColor("#3A2230"), QColor("#F0A0C0")},
        {QColor("#1F3A33"), QColor("#8FD9B8")},
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
        return QStringLiteral("One-time code");
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
        setFixedSize(38, 28);
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
    p.setBrush(QColor("#33290F"));
    p.drawRoundedRect(QRectF(0.5, 0.5, size - 1, size - 1), size * 0.28, size * 0.28);
    QPen pen(QColor("#D9A441"), qMax(1.6, size / 18.0));
    pen.setCapStyle(Qt::RoundCap);
    p.setPen(pen);
    const qreal cx = size / 2.0;
    const qreal cy = size / 2.0;
    const qreal r = size * 0.13;
    p.drawEllipse(QPointF(cx, cy - size * 0.05), r, r);
    p.drawLine(QPointF(cx, cy + r * 0.4), QPointF(cx, cy + size * 0.18));
    return pm;
}

class PasswordGeneratorDialog : public QDialog
{
public:
    explicit PasswordGeneratorDialog(QWidget* parent = nullptr)
        : QDialog(parent)
    {
        setWindowTitle(tr("Generate password"));
        setMinimumWidth(470);
        auto* layout = new QVBoxLayout(this);
        layout->setContentsMargins(22, 22, 22, 18);
        layout->setSpacing(12);

        m_preview = new QLabel();
        m_preview->setObjectName("generatorPreview");
        m_preview->setTextFormat(Qt::RichText);
        m_preview->setWordWrap(true);
        m_preview->setTextInteractionFlags(Qt::TextSelectableByMouse);
        m_preview->setMinimumHeight(64);
        layout->addWidget(m_preview);

        auto* strengthRow = new QHBoxLayout();
        strengthRow->setContentsMargins(0, 0, 0, 0);
        strengthRow->setSpacing(8);
        m_strengthBar = new QProgressBar();
        m_strengthBar->setObjectName("strengthBar");
        m_strengthBar->setRange(0, 100);
        m_strengthBar->setTextVisible(false);
        m_strengthBar->setFixedHeight(4);
        m_strength = new QLabel();
        m_strength->setObjectName("strengthStrong");
        strengthRow->addWidget(m_strengthBar, 1);
        strengthRow->addWidget(m_strength);
        layout->addLayout(strengthRow);

        auto* lengthRow = new QHBoxLayout();
        lengthRow->setContentsMargins(0, 0, 0, 0);
        lengthRow->setSpacing(10);
        lengthRow->addWidget(new QLabel(tr("Length")));
        m_slider = new QSlider(Qt::Horizontal);
        m_slider->setRange(8, 64);
        m_slider->setValue(20);
        m_length = new QSpinBox();
        m_length->setRange(8, 64);
        m_length->setValue(20);
        lengthRow->addWidget(m_slider, 1);
        lengthRow->addWidget(m_length);
        layout->addLayout(lengthRow);

        auto* options = new QGridLayout();
        options->setHorizontalSpacing(18);
        options->setVerticalSpacing(6);
        m_upper = new QCheckBox(tr("Uppercase"));
        m_lower = new QCheckBox(tr("Lowercase"));
        m_numbers = new QCheckBox(tr("Numbers"));
        m_symbols = new QCheckBox(tr("Symbols"));
        m_upper->setChecked(true);
        m_lower->setChecked(true);
        m_numbers->setChecked(true);
        m_symbols->setChecked(true);
        options->addWidget(m_upper, 0, 0);
        options->addWidget(m_lower, 0, 1);
        options->addWidget(m_numbers, 1, 0);
        options->addWidget(m_symbols, 1, 1);
        layout->addLayout(options);

        m_exclude = new QCheckBox(tr("Exclude look-alike characters (O0Il1)"));
        m_exclude->setChecked(true);
        m_every = new QCheckBox(tr("Require every selected type"));
        m_every->setChecked(true);
        layout->addWidget(m_exclude);
        layout->addWidget(m_every);

        auto* footer = new QHBoxLayout();
        footer->setContentsMargins(0, 4, 0, 0);
        footer->setSpacing(8);
        auto* regenerate = new QPushButton(tr("Regenerate"));
        regenerate->setObjectName("ghost");
        auto* cancel = new QPushButton(tr("Cancel"));
        auto* copy = new QPushButton(tr("Copy"));
        m_use = new QPushButton(tr("Use password"));
        m_use->setObjectName("primary");
        connect(regenerate, &QPushButton::clicked, this, [this] { generate(); });
        connect(cancel, &QPushButton::clicked, this, &QDialog::reject);
        connect(copy, &QPushButton::clicked, this, [this] {
            QApplication::clipboard()->setText(m_password);
        });
        connect(m_use, &QPushButton::clicked, this, &QDialog::accept);
        footer->addWidget(regenerate);
        footer->addStretch();
        footer->addWidget(cancel);
        footer->addWidget(copy);
        footer->addWidget(m_use);
        layout->addLayout(footer);

        connect(m_slider, &QSlider::valueChanged, m_length, &QSpinBox::setValue);
        connect(m_length, QOverload<int>::of(&QSpinBox::valueChanged), m_slider, &QSlider::setValue);
        connect(m_length, QOverload<int>::of(&QSpinBox::valueChanged), this, [this] { generate(); });
        const QList<QCheckBox*> boxes{m_upper, m_lower, m_numbers, m_symbols, m_exclude, m_every};
        for (auto* box : boxes) {
            connect(box, &QCheckBox::toggled, this, [this] { generate(); });
        }
        generate();
        m_use->setDefault(true);
    }

    QString password() const
    {
        return m_password;
    }

private:
    void generate()
    {
        PasswordGenerator::CharClasses classes = PasswordGenerator::NoClass;
        if (m_upper->isChecked()) {
            classes |= PasswordGenerator::UpperLetters;
        }
        if (m_lower->isChecked()) {
            classes |= PasswordGenerator::LowerLetters;
        }
        if (m_numbers->isChecked()) {
            classes |= PasswordGenerator::Numbers;
        }
        if (m_symbols->isChecked()) {
            classes |= PasswordGenerator::SpecialCharacters;
        }
        if (classes == PasswordGenerator::NoClass) {
            m_password.clear();
            m_preview->clear();
            m_strength->setText(tr("Choose at least one type"));
            m_strengthBar->setValue(0);
            m_use->setEnabled(false);
            return;
        }

        PasswordGenerator generator;
        generator.setLength(m_length->value());
        generator.setCharClasses(classes);
        PasswordGenerator::GeneratorFlags flags = PasswordGenerator::NoFlags;
        if (m_exclude->isChecked()) {
            flags |= PasswordGenerator::ExcludeLookAlike;
        }
        if (m_every->isChecked()) {
            flags |= PasswordGenerator::CharFromEveryGroup;
        }
        generator.setFlags(flags);
        m_password = generator.generatePassword();

        QString html;
        for (const auto& ch : m_password) {
            const auto escaped = QString(ch).toHtmlEscaped();
            if (ch.isDigit()) {
                html += QStringLiteral("<span style='color:#86B7E8'>%1</span>").arg(escaped);
            } else if (ch.isLetter()) {
                html += escaped;
            } else {
                html += QStringLiteral("<span style='color:#E8776D'>%1</span>").arg(escaped);
            }
        }
        m_preview->setText(html);

        int pool = (m_upper->isChecked() ? 26 : 0) + (m_lower->isChecked() ? 26 : 0)
                   + (m_numbers->isChecked() ? 10 : 0) + (m_symbols->isChecked() ? 30 : 0)
                   - (m_exclude->isChecked() ? 4 : 0);
        const double bits = m_length->value() * std::log2(std::max(2, pool));
        const bool weak = bits < 70;
        const QString strength = bits >= 90   ? tr("Very strong")
                                : bits >= 70 ? tr("Strong")
                                : bits >= 50 ? tr("Fair")
                                             : tr("Weak");
        m_strengthBar->setValue(qMin(100, qRound(bits)));
        m_strengthBar->setProperty("weak", weak);
        m_strengthBar->style()->unpolish(m_strengthBar);
        m_strengthBar->style()->polish(m_strengthBar);
        m_strength->setObjectName(weak ? "strengthWeak" : "strengthStrong");
        m_strength->setText(tr("%1, about %2 bits").arg(strength).arg(qRound(bits)));
        m_strength->style()->unpolish(m_strength);
        m_strength->style()->polish(m_strength);
        m_use->setEnabled(true);
    }

    QString m_password;
    QLabel* m_preview = nullptr;
    QLabel* m_strength = nullptr;
    QProgressBar* m_strengthBar = nullptr;
    QSpinBox* m_length = nullptr;
    QSlider* m_slider = nullptr;
    QCheckBox* m_upper = nullptr;
    QCheckBox* m_lower = nullptr;
    QCheckBox* m_numbers = nullptr;
    QCheckBox* m_symbols = nullptr;
    QCheckBox* m_exclude = nullptr;
    QCheckBox* m_every = nullptr;
    QPushButton* m_use = nullptr;
};

class EntryDialog : public QDialog
{
public:
    EntryDialog(const QString& type, Entry* entry, QWidget* parent)
        : QDialog(parent)
        , m_type(type)
    {
        setWindowTitle(entry ? tr("Edit item") : tr("New item"));
        setMinimumWidth(470);

        auto* layout = new QVBoxLayout(this);
        layout->setContentsMargins(24, 24, 24, 20);
        layout->setSpacing(14);

        auto* typeRow = new QHBoxLayout();
        typeRow->setContentsMargins(0, 0, 0, 0);
        typeRow->setSpacing(4);
        auto* typeGroup = new QButtonGroup(this);
        typeGroup->setExclusive(true);
        const QList<QPair<QString, QString>> types = {
            {QStringLiteral("Password"), tr("Password")},
            {QStringLiteral("Passkey"), tr("Passkey")},
            {QStringLiteral("TOTP"), tr("One-time code")},
            {QStringLiteral("Card"), tr("Card")},
        };
        for (const auto& item : types) {
            auto* button = new QPushButton(item.second);
            button->setObjectName("segment");
            button->setCheckable(true);
            button->setSizePolicy(QSizePolicy::Expanding, QSizePolicy::Fixed);
            typeGroup->addButton(button);
            m_typeButtons.insert(item.first, button);
            connect(button, &QPushButton::clicked, this, [this, item] { setType(item.first); });
            typeRow->addWidget(button);
        }
        layout->addLayout(typeRow);

        auto* form = new QFormLayout();
        form->setLabelAlignment(Qt::AlignLeft);
        form->setRowWrapPolicy(QFormLayout::WrapAllRows);
        form->setHorizontalSpacing(16);
        form->setVerticalSpacing(10);

        m_title = addField(form, tr("Title"), entry ? entry->title() : QString());
        m_username = addField(form, tr("Username"), entry ? entry->username() : QString());
        m_url = addField(form, tr("Website"), entry ? entry->url() : QString());

        m_passwordRow = new QWidget();
        auto* passwordBox = new QVBoxLayout(m_passwordRow);
        passwordBox->setContentsMargins(0, 0, 0, 0);
        passwordBox->setSpacing(5);
        auto* passwordLine = new QHBoxLayout();
        passwordLine->setContentsMargins(0, 0, 0, 0);
        passwordLine->setSpacing(8);
        m_password = new QLineEdit(entry ? entry->password() : QString());
        m_password->setEchoMode(QLineEdit::Password);
        auto* show = new QPushButton(tr("Show"));
        show->setObjectName("ghost");
        auto* generate = new QPushButton(tr("Generate"));
        passwordLine->addWidget(m_password, 1);
        passwordLine->addWidget(show);
        passwordLine->addWidget(generate);
        auto* strengthRow = new QHBoxLayout();
        strengthRow->setContentsMargins(0, 0, 0, 0);
        strengthRow->setSpacing(8);
        m_passwordBar = new QProgressBar();
        m_passwordBar->setObjectName("strengthBar");
        m_passwordBar->setRange(0, 100);
        m_passwordBar->setTextVisible(false);
        m_passwordBar->setFixedHeight(4);
        m_passwordStrength = new QLabel();
        m_passwordStrength->setObjectName("strengthStrong");
        strengthRow->addWidget(m_passwordBar, 1);
        strengthRow->addWidget(m_passwordStrength);
        passwordBox->addLayout(passwordLine);
        passwordBox->addLayout(strengthRow);
        form->addRow(tr("Password"), m_passwordRow);
        if (auto* caption = qobject_cast<QLabel*>(form->labelForField(m_passwordRow))) {
            caption->setObjectName("formLabel");
        }

        connect(show, &QPushButton::clicked, this, [this, show] {
            const bool hidden = m_password->echoMode() == QLineEdit::Password;
            m_password->setEchoMode(hidden ? QLineEdit::Normal : QLineEdit::Password);
            show->setText(hidden ? tr("Hide") : tr("Show"));
        });
        connect(generate, &QPushButton::clicked, this, [this] {
            PasswordGeneratorDialog dialog(this);
            if (dialog.exec() == QDialog::Accepted) {
                m_password->setText(dialog.password());
            }
        });
        connect(m_password, &QLineEdit::textChanged, this, [this] { updatePasswordStrength(); });

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
        if (auto* caption = qobject_cast<QLabel*>(form->labelForField(m_notes))) {
            caption->setObjectName("formLabel");
        }

        layout->addLayout(form);

        auto* buttons = new QHBoxLayout();
        buttons->addStretch();
        auto* cancel = new QPushButton(tr("Cancel"));
        auto* save = new QPushButton(tr("Save item"));
        save->setObjectName("primary");
        connect(cancel, &QPushButton::clicked, this, &QDialog::reject);
        connect(save, &QPushButton::clicked, this, &QDialog::accept);
        buttons->addWidget(cancel);
        buttons->addWidget(save);
        layout->addLayout(buttons);

        m_form = form;
        setType(m_type);
        updatePasswordStrength();
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

    QString entryType() const
    {
        return m_type;
    }

private:
    QLineEdit* addField(QFormLayout* form, const QString& label, const QString& value, bool password = false)
    {
        auto* edit = new QLineEdit(value);
        if (password) {
            edit->setEchoMode(QLineEdit::Password);
        }
        form->addRow(label, edit);
        if (auto* caption = qobject_cast<QLabel*>(form->labelForField(edit))) {
            caption->setObjectName("formLabel");
        }
        return edit;
    }

    void setType(const QString& type)
    {
        m_type = type;
        for (auto it = m_typeButtons.begin(); it != m_typeButtons.end(); ++it) {
            it.value()->setChecked(it.key() == type);
        }

        m_form->setRowVisible(m_username, type != QStringLiteral("Card"));
        m_form->setRowVisible(m_url, type == QStringLiteral("Password"));
        m_form->setRowVisible(m_passwordRow, type == QStringLiteral("Password"));
        m_form->setRowVisible(m_secret, type == QStringLiteral("TOTP"));
        m_form->setRowVisible(m_holder, type == QStringLiteral("Card"));
        m_form->setRowVisible(m_number, type == QStringLiteral("Card"));
        m_form->setRowVisible(m_expiry, type == QStringLiteral("Card"));
        m_form->setRowVisible(m_cvv, type == QStringLiteral("Card"));
        m_form->setRowVisible(m_rpId, type == QStringLiteral("Passkey"));
        m_form->setRowVisible(m_credentialId, type == QStringLiteral("Passkey"));
        m_form->setRowVisible(m_privateKey, type == QStringLiteral("Passkey"));
        adjustSize();
    }

    void updatePasswordStrength()
    {
        if (!m_passwordBar || !m_passwordStrength) {
            return;
        }
        const auto password = m_password->text();
        int pool = 0;
        if (password.contains(QRegularExpression(QStringLiteral("[a-z]")))) pool += 26;
        if (password.contains(QRegularExpression(QStringLiteral("[A-Z]")))) pool += 26;
        if (password.contains(QRegularExpression(QStringLiteral("[0-9]")))) pool += 10;
        if (password.contains(QRegularExpression(QStringLiteral("[^a-zA-Z0-9]")))) pool += 30;
        const int bits = password.isEmpty() ? 0 : qRound(password.length() * std::log2(std::max(2, pool)));
        const bool weak = password.length() < 10 || bits < 70;
        m_passwordBar->setValue(qMin(100, bits));
        m_passwordBar->setProperty("weak", weak);
        m_passwordBar->style()->unpolish(m_passwordBar);
        m_passwordBar->style()->polish(m_passwordBar);
        m_passwordStrength->setObjectName(weak ? "strengthWeak" : "strengthStrong");
        m_passwordStrength->setText(password.isEmpty() ? QString() : (weak ? tr("Weak") : tr("Strong")));
        m_passwordStrength->style()->unpolish(m_passwordStrength);
        m_passwordStrength->style()->polish(m_passwordStrength);
    }

    QString m_type;
    QFormLayout* m_form = nullptr;
    QHash<QString, QPushButton*> m_typeButtons;
    QWidget* m_passwordRow = nullptr;
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
    QProgressBar* m_passwordBar = nullptr;
    QLabel* m_passwordStrength = nullptr;
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
    resize(1120, 680);

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
    sidebar->setFixedWidth(216);
    sidebar->setObjectName("sidebar");
    auto* sideLayout = new QVBoxLayout(sidebar);
    sideLayout->setContentsMargins(10, 16, 10, 12);
    sideLayout->setSpacing(2);

    auto* vaultHeader = new QWidget();
    auto* vaultHeaderLayout = new QHBoxLayout(vaultHeader);
    vaultHeaderLayout->setContentsMargins(6, 0, 6, 14);
    vaultHeaderLayout->setSpacing(10);
    auto* vaultAvatar = new QLabel();
    vaultAvatar->setObjectName("vaultLogo");
    vaultAvatar->setPixmap(makeLogoPixmap(34));
    vaultAvatar->setFixedSize(34, 34);
    auto* vaultText = new QVBoxLayout();
    vaultText->setContentsMargins(0, 0, 0, 0);
    vaultText->setSpacing(0);
    m_vaultName = new QLabel(tr("Personal Vault"));
    m_vaultName->setObjectName("vaultName");
    m_status = new QLabel(tr("<span style='color:#D9A441'>&#9679;</span> Locked"));
    m_status->setTextFormat(Qt::RichText);
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
            m_tag.clear();
            refreshList();
            refreshCounts();
        });
        sideLayout->addWidget(b);
    };
    nav(tr("All items"), QStringLiteral("all"));
    nav(tr("Favorites"), QStringLiteral("favorite"));
    auto* catLabel = new QLabel(tr("Types"));
    catLabel->setObjectName("sectionLabel");
    sideLayout->addWidget(catLabel);
    nav(tr("Passwords"), QStringLiteral("password"));
    nav(tr("Passkeys"), QStringLiteral("passkey"));
    nav(tr("One-time codes"), QStringLiteral("totp"));
    nav(tr("Cards"), QStringLiteral("card"));

    auto* tagsLabel = new QLabel(tr("Tags"));
    tagsLabel->setObjectName("sectionLabel");
    sideLayout->addWidget(tagsLabel);
    auto* tagsWidget = new QWidget();
    m_tagsLayout = new QVBoxLayout(tagsWidget);
    m_tagsLayout->setContentsMargins(0, 0, 0, 0);
    m_tagsLayout->setSpacing(2);
    sideLayout->addWidget(tagsWidget);

    sideLayout->addStretch();

    auto* healthCard = new QWidget();
    healthCard->setObjectName("healthCard");
    auto* healthLayout = new QVBoxLayout(healthCard);
    healthLayout->setContentsMargins(12, 12, 12, 12);
    healthLayout->setSpacing(8);
    auto* healthTitle = new QLabel(tr("Vault health"));
    healthTitle->setObjectName("healthTitle");
    m_healthBar = new QProgressBar();
    m_healthBar->setObjectName("healthBar");
    m_healthBar->setRange(0, 100);
    m_healthBar->setValue(100);
    m_healthBar->setTextVisible(false);
    m_healthBar->setFixedHeight(6);
    m_health = new QLabel(tr("No items"));
    m_health->setObjectName("healthDetail");
    m_health->setWordWrap(true);
    healthLayout->addWidget(healthTitle);
    healthLayout->addWidget(m_healthBar);
    healthLayout->addWidget(m_health);
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
    topbar->setFixedHeight(56);
    auto* topLayout = new QHBoxLayout(topbar);
    topLayout->setContentsMargins(18, 12, 12, 12);
    m_search = new QLineEdit();
    m_search->setObjectName("search");
    m_search->setPlaceholderText(tr("Search your vault"));
    m_search->setMaximumWidth(400);
    m_search->setMinimumWidth(300);
    connect(m_search, &QLineEdit::textChanged, this, [this] { refreshList(); });
    auto* add = new QPushButton(tr("New item"));
    add->setObjectName("primary");
    connect(add, &QPushButton::clicked, this, &PersonalVaultWindow::addItem);
    auto* generate = new QPushButton(tr("Generate"));
    connect(generate, &QPushButton::clicked, this, [this] {
        PasswordGeneratorDialog dialog(this);
        if (dialog.exec() == QDialog::Accepted) {
            copyText(dialog.password(), tr("Password"));
        }
    });
    auto* lockTop = new QPushButton(tr("Lock"));
    connect(lockTop, &QPushButton::clicked, this, &PersonalVaultWindow::lockVault);
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
    topLayout->addWidget(m_search, 1);
    topLayout->addStretch();
    topLayout->addWidget(generate);
    topLayout->addWidget(add);
    topLayout->addWidget(lockTop);
    topLayout->addSpacing(8);
    topLayout->addWidget(minimize);
    topLayout->addWidget(maximize);
    topLayout->addWidget(closeButton);
    mainLayout->addWidget(topbar);

    auto* splitter = new QSplitter(Qt::Horizontal);
    m_list = new QListWidget();
    m_list->setSpacing(0);
    m_list->setHorizontalScrollBarPolicy(Qt::ScrollBarAlwaysOff);
    connect(m_list, &QListWidget::currentItemChanged, this, [this](QListWidgetItem* item) {
        for (int i = 0; i < m_list->count(); ++i) {
            auto* rowItem = m_list->item(i);
            auto* accent = reinterpret_cast<QWidget*>(rowItem->data(Qt::UserRole + 1).toULongLong());
            if (accent) {
                accent->setStyleSheet(rowItem == item ? QStringLiteral("background:#D9A441;")
                                                      : QStringLiteral("background:transparent;"));
            }
        }
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
    headerLayout->setContentsMargins(16, 16, 18, 10);
    headerLayout->setSpacing(10);
    m_listTitle = new QLabel(tr("All items"));
    m_listTitle->setObjectName("listTitle");
    m_listCount = new QLabel();
    m_listCount->setObjectName("listCount");
    headerLayout->addWidget(m_listTitle);
    headerLayout->addWidget(m_listCount);
    headerLayout->addStretch();
    listLayout->addWidget(listHeader);
    listLayout->addWidget(m_list, 1);
    splitter->addWidget(listPane);

    auto* scroll = new QScrollArea();
    scroll->setWidgetResizable(true);
    scroll->setHorizontalScrollBarPolicy(Qt::ScrollBarAlwaysOff);
    scroll->setAlignment(Qt::AlignTop);
    scroll->setMinimumWidth(380);
    scroll->setMaximumWidth(380);
    m_details = new QWidget();
    m_detailsLayout = new QVBoxLayout(m_details);
    m_detailsLayout->setContentsMargins(18, 18, 18, 18);
    m_detailsLayout->setSpacing(10);
    scroll->setWidget(m_details);
    splitter->addWidget(scroll);
    splitter->setStretchFactor(0, 1);
    splitter->setStretchFactor(1, 0);
    splitter->setSizes({740, 380});
    mainLayout->addWidget(splitter, 1);

    root->addWidget(main, 1);
    m_main = main;

    // In-window lock screen (overlays the main pane, keeps the sidebar visible).
    m_lockPanel = new QWidget(main);
    m_lockPanel->setObjectName("lockPanel");
    auto* lockLayout = new QVBoxLayout(m_lockPanel);
    lockLayout->setContentsMargins(24, 24, 24, 24);
    lockLayout->setSpacing(0);
    lockLayout->addStretch(1);
    auto* lockCard = new QWidget();
    lockCard->setObjectName("lockCard");
    lockCard->setFixedWidth(340);
    auto* lockCardLayout = new QVBoxLayout(lockCard);
    lockCardLayout->setContentsMargins(28, 28, 28, 24);
    lockCardLayout->setSpacing(12);
    auto* lockLogo = new QLabel();
    lockLogo->setPixmap(makeLogoPixmap(52));
    lockLogo->setFixedSize(52, 52);
    lockCardLayout->addWidget(lockLogo, 0, Qt::AlignHCenter);
    auto* lockTitle = new QLabel(tr("Vault is locked"));
    lockTitle->setObjectName("lockTitle");
    lockTitle->setAlignment(Qt::AlignHCenter);
    lockCardLayout->addWidget(lockTitle);
    m_lockFile = new QLabel(tr("No vault open"));
    m_lockFile->setObjectName("lockFile");
    m_lockFile->setAlignment(Qt::AlignHCenter);
    m_lockFile->setWordWrap(true);
    lockCardLayout->addWidget(m_lockFile);
    m_lockPassword = new QLineEdit();
    m_lockPassword->setEchoMode(QLineEdit::Password);
    m_lockPassword->setPlaceholderText(tr("Master password"));
    lockCardLayout->addWidget(m_lockPassword);
    m_lockError = new QLabel();
    m_lockError->setObjectName("lockError");
    m_lockError->setAlignment(Qt::AlignHCenter);
    m_lockError->setWordWrap(true);
    m_lockError->hide();
    lockCardLayout->addWidget(m_lockError);
    auto* unlock = new QPushButton(tr("Unlock"));
    unlock->setObjectName("primary");
    unlock->setMinimumHeight(38);
    lockCardLayout->addWidget(unlock);
    auto* openAnother = new QPushButton(tr("Open another vault"));
    openAnother->setObjectName("ghost");
    lockCardLayout->addWidget(openAnother, 0, Qt::AlignHCenter);
    auto unlockVault = [this] {
        if (m_vaultPath.isEmpty() || !QFileInfo::exists(m_vaultPath)) {
            promptOpen();
            return;
        }
        m_lockError->hide();
        if (!openVaultWithPassword(m_vaultPath, m_lockPassword->text())) {
            m_lockError->setText(tr("Wrong password or unreadable vault"));
            m_lockError->show();
            m_lockPassword->selectAll();
            m_lockPassword->setFocus();
        }
    };
    connect(unlock, &QPushButton::clicked, this, unlockVault);
    connect(m_lockPassword, &QLineEdit::returnPressed, this, unlockVault);
    connect(openAnother, &QPushButton::clicked, this, &PersonalVaultWindow::promptOpen);
    lockLayout->addWidget(lockCard, 0, Qt::AlignHCenter);
    lockLayout->addStretch(1);
    m_lockPanel->setGeometry(main->rect());
    m_lockPanel->raise();
    m_lockPanel->hide();

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
            m_vaultPath = path;
            if (m_lockFile) {
                m_lockFile->setText(QFileInfo(path).fileName());
            }
            openVault(path);
            return;
        }
    }
    if (m_lockPanel) {
        m_lockFile->setText(tr("No vault open"));
        m_lockPanel->setGeometry(m_main->rect());
        m_lockPanel->raise();
        m_lockPanel->show();
        m_lockPassword->setFocus();
    }
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
    if (m_lockPanel && m_main && !m_db) {
        m_lockPanel->setGeometry(m_main->rect());
        m_lockPanel->raise();
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
    if (m_lockPanel) {
        m_lockFile->setText(m_vaultPath.isEmpty() ? tr("No vault open") : QFileInfo(m_vaultPath).fileName());
        m_lockPassword->clear();
        m_lockError->hide();
        m_lockPanel->setGeometry(m_main->rect());
        m_lockPanel->raise();
        m_lockPanel->show();
        m_lockPassword->setFocus();
    }
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
    m_vaultPath = path;
    m_vaultName->setText(tr("Personal Vault"));
    m_vaultName->setToolTip(path);
    if (m_lockFile) {
        m_lockFile->setText(QFileInfo(path).fileName());
    }
    if (m_lockPassword) {
        m_lockPassword->clear();
    }
    if (m_lockError) {
        m_lockError->hide();
    }
    if (m_lockPanel) {
        m_lockPanel->hide();
    }
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
    m_vaultPath = path;
    if (m_lockFile) {
        m_lockFile->setText(QFileInfo(path).fileName());
    }
    if (m_lockError) {
        m_lockError->hide();
    }
    if (m_lockPassword) {
        m_lockPassword->clear();
        m_lockPassword->setFocus();
    }
    if (m_lockPanel && m_main) {
        m_lockPanel->setGeometry(m_main->rect());
        m_lockPanel->raise();
        m_lockPanel->show();
    }
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
    m_status->setText(m_db ? tr("<span style='color:#6DBF9A'>&#9679;</span> Unlocked")
                               : tr("<span style='color:#D9A441'>&#9679;</span> Locked"));
    m_status->setProperty("locked", !m_db);
    m_status->style()->unpolish(m_status);
    m_status->style()->polish(m_status);
    if (!m_db) {
        clearDetails();
    }
    if (m_lockPanel) {
        if (!m_db) {
            m_lockPanel->setGeometry(m_main->rect());
            m_lockPanel->raise();
            m_lockPanel->show();
        } else {
            m_lockPanel->hide();
        }
    }
}

void PersonalVaultWindow::refreshCounts()
{
    int all = 0, password = 0, passkey = 0, totp = 0, card = 0, weak = 0, favorite = 0;
    QStringList tags;
    if (m_db) {
        for (const auto* entry : m_db->rootGroup()->entriesRecursive()) {
            if (entry->group()->isRecycled()) {
                continue;
            }
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
    setText(QStringLiteral("all"), tr("All items (%1)").arg(all));
    setText(QStringLiteral("favorite"), tr("Favorites (%1)").arg(favorite));
    setText(QStringLiteral("password"), tr("Passwords (%1)").arg(password));
    setText(QStringLiteral("passkey"), tr("Passkeys (%1)").arg(passkey));
    setText(QStringLiteral("totp"), tr("One-time codes (%1)").arg(totp));
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
            chip->setObjectName("nav");
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
    }

    if (m_healthBar) {
        const int score = all > 0 ? qMax(0, 100 - (weak * 100 / all)) : 100;
        m_healthBar->setValue(score);
    }
    if (m_health) {
        if (weak == 1) {
            m_health->setText(tr("1 weak password"));
        } else if (weak > 1) {
            m_health->setText(tr("%1 weak passwords").arg(weak));
        } else {
            m_health->setText(tr("All passwords look strong"));
        }
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
        if (entry->group()->isRecycled() || !matches(entry)) {
            continue;
        }
        auto* item = new QListWidgetItem(m_list);
        item->setData(Qt::UserRole, static_cast<qulonglong>(reinterpret_cast<quintptr>(entry)));
        item->setSizeHint(QSize(0, 56));

        auto* row = new QWidget();
        auto* rowLayout = new QHBoxLayout(row);
        rowLayout->setContentsMargins(10, 6, 13, 6);
        rowLayout->setSpacing(12);

        auto* accent = new QWidget();
        accent->setObjectName("rowAccent");
        accent->setFixedWidth(3);
        rowLayout->addWidget(accent);
        item->setData(Qt::UserRole + 1, static_cast<qulonglong>(reinterpret_cast<quintptr>(accent)));

        const auto title = entry->title().isEmpty() ? tr("Untitled") : entry->title();
        const auto userText = primaryUser(entry);
        const auto [bg, fg] = avatarFor(title);
        auto* avatar = new QLabel(avatarLetter(title, userText));
        avatar->setObjectName("avatar");
        avatar->setAlignment(Qt::AlignCenter);
        avatar->setFixedSize(36, 36);
        avatar->setStyleSheet(QStringLiteral("background:%1;color:%2;border-radius:10px;font-weight:600;font-family:Georgia;font-size:15px;").arg(bg.name(), fg.name()));
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
        user->setFixedWidth(150);
        rowLayout->addWidget(user);

        auto* date = new QLabel(updatedText(entry));
        date->setObjectName("rowDate");
        date->setFixedWidth(54);
        date->setAlignment(Qt::AlignRight | Qt::AlignVCenter);
        rowLayout->addWidget(date);

        m_list->setItemWidget(item, row);
        if (entry->uuid() == currentId) {
            m_list->setCurrentItem(item);
        }
    }

    if (m_listTitle) {
        if (!m_tag.isEmpty()) {
            m_listTitle->setText(m_tag);
        } else if (m_filter == QStringLiteral("favorite")) {
            m_listTitle->setText(tr("Favorites"));
        } else if (m_filter == QStringLiteral("password")) {
            m_listTitle->setText(tr("Passwords"));
        } else if (m_filter == QStringLiteral("passkey")) {
            m_listTitle->setText(tr("Passkeys"));
        } else if (m_filter == QStringLiteral("totp")) {
            m_listTitle->setText(tr("One-time codes"));
        } else if (m_filter == QStringLiteral("card")) {
            m_listTitle->setText(tr("Cards"));
        } else {
            m_listTitle->setText(tr("All items"));
        }
    }
    if (m_listCount) {
        const auto count = m_list->count();
        m_listCount->setText(count == 1 ? tr("1 item") : tr("%1 items").arg(count));
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
    m_totpBar = nullptr;
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
    clearLayout(m_detailsLayout);

    m_passwordVisible = false;
    const auto title = entry->title().isEmpty() ? tr("Untitled") : entry->title();
    const auto [bg, fg] = avatarFor(title);
    const auto type = typeOf(entry);

    auto* head = new QWidget();
    auto* headLayout = new QHBoxLayout(head);
    headLayout->setContentsMargins(0, 0, 0, 8);
    headLayout->setSpacing(14);
    auto* avatar = new QLabel(avatarLetter(title, primaryUser(entry)));
    avatar->setObjectName("avatar");
    avatar->setAlignment(Qt::AlignCenter);
    avatar->setFixedSize(56, 56);
    avatar->setStyleSheet(QStringLiteral("background:%1;color:%2;border-radius:14px;font-family:Georgia;font-size:22px;font-weight:600;").arg(bg.name(), fg.name()));
    headLayout->addWidget(avatar);

    auto* headText = new QVBoxLayout();
    headText->setContentsMargins(0, 0, 0, 0);
    headText->setSpacing(2);
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

    const auto badgeText = type == QStringLiteral("totp") ? tr("TOTP") : prettyType(type);
    auto* typeLabel = new QLabel(badgeText);
    typeLabel->setObjectName("typeBadge");
    headLayout->addWidget(typeLabel);
    m_detailsLayout->addWidget(head);

    auto addField = [this](const QString& label, const QString& value, bool copy, const QString& copyValue = QString()) {
        auto* box = new QWidget();
        box->setObjectName("fieldBox");
        auto* layout = new QVBoxLayout(box);
        layout->setContentsMargins(0, 11, 0, 11);
        layout->setSpacing(3);
        auto* caption = new QLabel(label);
        caption->setObjectName("fieldLabel");
        auto* row = new QHBoxLayout();
        row->setContentsMargins(0, 0, 0, 0);
        row->setSpacing(8);
        auto* text = new QLabel(value.isEmpty() ? tr("None") : value);
        text->setObjectName("fieldValue");
        text->setWordWrap(true);
        text->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Preferred);
        text->setMinimumWidth(0);
        text->setTextInteractionFlags(Qt::TextSelectableByMouse);
        row->addWidget(text, 1);
        if (copy) {
            auto* button = new QPushButton(tr("Copy"));
            button->setObjectName("ghost");
            const auto toCopy = copyValue.isNull() ? value : copyValue;
            connect(button, &QPushButton::clicked, this, [this, toCopy, label] { copyText(toCopy, label); });
            row->addWidget(button);
        }
        layout->addWidget(caption);
        layout->addLayout(row);
        m_detailsLayout->addWidget(box);
    };

    auto passwordBits = [](const QString& password) {
        int pool = 0;
        if (password.contains(QRegularExpression(QStringLiteral("[a-z]")))) pool += 26;
        if (password.contains(QRegularExpression(QStringLiteral("[A-Z]")))) pool += 26;
        if (password.contains(QRegularExpression(QStringLiteral("[0-9]")))) pool += 10;
        if (password.contains(QRegularExpression(QStringLiteral("[^a-zA-Z0-9]")))) pool += 30;
        return qRound(password.length() * std::log2(std::max(2, pool)));
    };

    if (type == QStringLiteral("password")) {
        addField(tr("Username"), entry->username(), true);

        auto* box = new QWidget();
        box->setObjectName("fieldBox");
        auto* layout = new QVBoxLayout(box);
        layout->setContentsMargins(0, 11, 0, 11);
        layout->setSpacing(5);
        auto* caption = new QLabel(tr("Password"));
        caption->setObjectName("fieldLabel");
        auto* row = new QHBoxLayout();
        row->setContentsMargins(0, 0, 0, 0);
        row->setSpacing(8);
        auto* value = new QLabel(QString(QChar(0x2022)).repeated(12));
        value->setObjectName("passwordValue");
        value->setTextInteractionFlags(Qt::TextSelectableByMouse);
        value->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Preferred);
        auto* show = new QPushButton(tr("Show"));
        show->setObjectName("ghost");
        auto* copy = new QPushButton(tr("Copy"));
        copy->setObjectName("ghost");
        connect(show, &QPushButton::clicked, this, [this, entry, value, show] {
            m_passwordVisible = !m_passwordVisible;
            value->setText(m_passwordVisible ? entry->password() : QString(QChar(0x2022)).repeated(12));
            show->setText(m_passwordVisible ? tr("Hide") : tr("Show"));
        });
        connect(copy, &QPushButton::clicked, this, [this, entry] { copyText(entry->password(), tr("Password")); });
        row->addWidget(value, 1);
        row->addWidget(show);
        row->addWidget(copy);
        layout->addWidget(caption);
        layout->addLayout(row);

        const bool weak = isWeak(entry);
        auto* strength = new QProgressBar();
        strength->setObjectName("strengthBar");
        strength->setRange(0, 100);
        strength->setValue(weak ? qMin(40, passwordBits(entry->password())) : qMin(100, passwordBits(entry->password())));
        strength->setTextVisible(false);
        strength->setFixedHeight(4);
        strength->setProperty("weak", weak);
        auto* strengthText = new QLabel(weak ? tr("Weak") : tr("Strong"));
        strengthText->setObjectName(weak ? "strengthWeak" : "strengthStrong");
        auto* strengthRow = new QHBoxLayout();
        strengthRow->setContentsMargins(0, 0, 0, 0);
        strengthRow->setSpacing(8);
        strengthRow->addWidget(strength, 1);
        strengthRow->addWidget(strengthText);
        layout->addLayout(strengthRow);
        m_detailsLayout->addWidget(box);
    } else if (type == QStringLiteral("totp")) {
        addField(tr("Username"), entry->username(), true);
        auto* box = new QWidget();
        box->setObjectName("fieldBox");
        auto* layout = new QVBoxLayout(box);
        layout->setContentsMargins(0, 11, 0, 11);
        layout->setSpacing(6);
        auto* caption = new QLabel(tr("One-time code"));
        caption->setObjectName("fieldLabel");
        auto* row = new QHBoxLayout();
        row->setContentsMargins(0, 0, 0, 0);
        row->setSpacing(8);
        m_totpLabel = new QLabel(entry->totp());
        m_totpLabel->setObjectName("totpCode");
        m_totpLabel->setTextInteractionFlags(Qt::TextSelectableByMouse);
        auto* copy = new QPushButton(tr("Copy"));
        copy->setObjectName("ghost");
        connect(copy, &QPushButton::clicked, this, [this] {
            copyText(m_totpLabel ? m_totpLabel->text() : QString(), tr("TOTP code"));
        });
        row->addWidget(m_totpLabel, 1);
        row->addWidget(copy);
        m_totpBar = new QProgressBar();
        m_totpBar->setObjectName("totpBar");
        m_totpBar->setRange(0, 100);
        m_totpBar->setValue(100);
        m_totpBar->setTextVisible(false);
        m_totpBar->setFixedHeight(3);
        layout->addWidget(caption);
        layout->addLayout(row);
        layout->addWidget(m_totpBar);
        m_detailsLayout->addWidget(box);
        updateTotp();
    } else if (type == QStringLiteral("card")) {
        addField(tr("Cardholder"), entry->attributes()->value(CARD_HOLDER), true);
        const auto number = entry->attributes()->value(CARD_NUMBER);
        const auto dot = QString(QChar(0x2022)).repeated(4);
        addField(tr("Card number"),
                 number.isEmpty() ? QString() : dot + QStringLiteral(" ") + dot + QStringLiteral(" ") + number.right(4),
                 true,
                 number);
        addField(tr("Expires"), entry->attributes()->value(CARD_EXPIRY), false);
        addField(tr("CVV"), QString(QChar(0x2022)).repeated(3), false);
    } else if (type == QStringLiteral("passkey")) {
        addField(tr("Username"), entry->attributes()->value(EntryAttributes::KPEX_PASSKEY_USERNAME), true);
        addField(tr("Relying party"), entry->attributes()->value(EntryAttributes::KPEX_PASSKEY_RELYING_PARTY), true);
        addField(tr("Credential ID"), entry->attributes()->value(EntryAttributes::KPEX_PASSKEY_CREDENTIAL_ID), true);
    }

    if (!entry->notes().isEmpty()) {
        addField(tr("Notes"), entry->notes(), true);
    }

    auto* actions = new QHBoxLayout();
    actions->setContentsMargins(0, 12, 0, 0);
    actions->setSpacing(8);
    auto* copyMain = new QPushButton(type == QStringLiteral("password") ? tr("Copy password")
                                     : type == QStringLiteral("totp") ? tr("Copy code")
                                     : type == QStringLiteral("card") ? tr("Copy card number")
                                                                     : tr("Copy credential ID"));
    copyMain->setObjectName("primary");
    copyMain->setMinimumHeight(40);
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
    auto* favorite = new QPushButton(entry->tagList().contains(QStringLiteral("Favorite"), Qt::CaseInsensitive)
                                         ? QString(QChar(0x2605))
                                         : QString(QChar(0x2606)));
    favorite->setObjectName("ghost");
    favorite->setFixedWidth(32);
    favorite->setToolTip(tr("Favorite"));
    connect(favorite, &QPushButton::clicked, this, [this, entry] { toggleFavorite(entry); });
    auto* edit = new QPushButton(tr("Edit"));
    auto* del = new QPushButton(tr("Delete"));
    del->setObjectName("danger");
    connect(edit, &QPushButton::clicked, this, [this, entry] { editItem(entry); });
    connect(del, &QPushButton::clicked, this, [this, entry] { deleteItem(entry); });
    actions->addWidget(copyMain, 1);
    actions->addWidget(favorite);
    actions->addWidget(edit);
    actions->addWidget(del);
    m_detailsLayout->addLayout(actions);
    m_detailsLayout->addStretch();
}

void PersonalVaultWindow::addItem()
{
    if (!m_db) {
        if (m_lockPanel) {
            m_lockPanel->show();
            m_lockPanel->raise();
            m_lockPassword->setFocus();
        }
        return;
    }
    EntryDialog dialog(QStringLiteral("Password"), nullptr, this);
    if (dialog.exec() != QDialog::Accepted) {
        return;
    }
    auto* entry = new Entry();
    entry->setGroup(m_db->rootGroup());
    dialog.apply(entry);
    if (entry->title().isEmpty()) {
        const auto type = dialog.entryType();
        const auto label = type == QStringLiteral("TOTP") ? tr("One-time code")
                           : type == QStringLiteral("Password") ? tr("Password")
                           : type;
        entry->setTitle(label + tr(" item"));
    }
    m_db->markAsModified();
    saveDatabase();
    m_current = entry;
    refresh();
    showDetails(entry);
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
        if (m_totpBar && m_current->totpSettings()) {
            const auto step = qMax(1u, m_current->totpSettings()->step);
            const auto elapsed = static_cast<quint32>(QDateTime::currentSecsSinceEpoch() % step);
            const auto remaining = step - elapsed;
            m_totpBar->setValue(static_cast<int>(remaining * 100 / step));
        }
    }
}
