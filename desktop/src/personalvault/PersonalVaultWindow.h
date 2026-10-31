#ifndef PERSONALVAULTWINDOW_H
#define PERSONALVAULTWINDOW_H

#include <QHash>
#include <QMainWindow>
#include <QSharedPointer>
#include <QStringList>

class Database;
class Entry;
class QHBoxLayout;
class QLabel;
class QLineEdit;
class QListWidget;
class QPushButton;
class QResizeEvent;
class QSizeGrip;
class QTimer;
class QVBoxLayout;
class QWidget;

class PersonalVaultWindow : public QMainWindow
{
public:
    explicit PersonalVaultWindow(QWidget* parent = nullptr);
    ~PersonalVaultWindow() override = default;

    void promptOpen();
    void openLastVault();
    bool openVault(const QString& path);
    bool openVaultWithPassword(const QString& path, const QString& password);

protected:
    void resizeEvent(QResizeEvent* event) override;

private:
    void buildUi();
    void refresh();
    void refreshList();
    void refreshCounts();
    void showDetails(Entry* entry);
    void clearDetails();
    void addItem();
    void editItem(Entry* entry);
    void deleteItem(Entry* entry);
    void toggleFavorite(Entry* entry);
    void importBitwarden();
    void copyText(const QString& text, const QString& label);
    void saveDatabase();
    void showSettingsMenu();
    void addRecent(const QString& path);
    QStringList recentFiles() const;

    QString typeOf(const Entry* entry) const;
    bool matches(const Entry* entry) const;
    QString primaryUser(const Entry* entry) const;
    QString updatedText(const Entry* entry) const;
    bool isWeak(const Entry* entry) const;
    void updateTotp();

    QSharedPointer<Database> m_db;
    QListWidget* m_list = nullptr;
    QLineEdit* m_search = nullptr;
    QWidget* m_details = nullptr;
    QVBoxLayout* m_detailsLayout = nullptr;
    QLabel* m_totpLabel = nullptr;
    QLabel* m_vaultName = nullptr;
    QLabel* m_status = nullptr;
    QLabel* m_health = nullptr;
    QLabel* m_healthRing = nullptr;
    QLabel* m_autoLock = nullptr;
    QHBoxLayout* m_tagsLayout = nullptr;
    QHash<QString, QPushButton*> m_navButtons;
    QPushButton* m_allButton = nullptr;
    QSizeGrip* m_sizeGrip = nullptr;
    QTimer* m_totpTimer = nullptr;
    Entry* m_current = nullptr;
    QString m_filter = QStringLiteral("all");
    QString m_tag;
};

#endif
