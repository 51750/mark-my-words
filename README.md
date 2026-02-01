# Mark My Words

![Mark My Words Demo](screenshot/page.png)
<img src="screenshot/notes.png" alt="Notes" width="350">

## ✨ Features

### Core Functionality
-   **Contextual Highlighting**: Select any text to translate and save it. The extension automatically highlights this word on the current page and any future pages you visit.
-   **Inline Translation**: View translations instantly by hovering over highlighted words.
-   **Multi-Color Organization**: Choose from a customizable color palette when marking words to organize by category, difficulty, or any system you prefer.
-   **Smart Management**:
    -   **Edit**: Click the translation label to modify it instantly.
    -   **Delete**: Click the highlighted word to remove it. Changes sync immediately across the page.

### Translation Options
-   **Auto-Translate Mode**: Automatically translate selected words using Google Translate API (default).
-   **Manual Mode**: Disable auto-translate in settings to enter your own custom translations via prompt.
-   **Language Selection**: Choose both source and target languages, with auto-detection available for source language.

### Organization & Customization
-   **Settings Page**: Centralized configuration for all extension preferences:
    -   **Extension Theme**: Customize the primary color for the UI and default highlights.
    -   **Color Palette**: Add, remove, and manage colors for organizing your vocabulary.
    -   **Translation Settings**: Toggle auto-translate on/off.
    -   **Factory Reset**: Restore all settings to defaults (vocabulary is preserved).
-   **Quick Tips**: Built-in help section in settings to guide you through features.

### Vocabulary Management
-   **Filtering**: Toggle between viewing words saved on the **Current Page** or your **Entire History**.
-   **Source Linking**: When viewing "All Words", click the link to jump back to the exact page where you originally saved the word.
-   **Search**: Quickly find specific words in your vocabulary list.
-   **Export**: Export your vocabulary list to CSV for study in Anki or Excel.

### Privacy & Performance
-   **Privacy Focused**: All data is stored locally in your browser (`chrome.storage.local`).
-   **Zero Dependencies**: Built with vanilla HTML/CSS/JS for maximum performance.

## 🚀 Installation

### From Source (Developer Mode)

1.  Clone this repository:
    ```bash
    git clone https://github.com/yourusername/mark-my-words.git
    ```
2.  Open Chrome and navigate to `chrome://extensions/`.
3.  Enable **Developer mode** in the top right corner.
4.  Click **Load unpacked**.
5.  Select the directory where you cloned the repository.

## 📖 Usage

### Marking Words

1.  **Select & Save**: Highlight any text on a webpage. A floating "Mark It" button will appear with a color palette.
2.  **Choose Color** (Optional): Click a color dot to mark the word with that specific color, or click the main button to use the default theme color.
3.  **Translation**: 
    -   With auto-translate enabled (default): The word is automatically translated.
    -   With auto-translate disabled: You'll be prompted to enter a custom translation.

### Managing Your Vocabulary

1.  **View List**: Click the extension icon to open the popup.
2.  **Filter**: Use the toggle switch to view words from the "Current Page" or "All" pages.
3.  **Search**: Type in the search box to find specific words.
4.  **Language Settings**: Select source and target languages (only visible when auto-translate is enabled).
5.  **Export**: Click the export button to download your vocabulary as CSV.

### Settings & Customization

1.  **Open Settings**: Click the gear icon in the popup header.
2.  **Customize Theme**: Choose your preferred primary color for the extension UI.
3.  **Manage Colors**: Add or remove colors from your marking palette.
4.  **Translation Mode**: Toggle auto-translate on/off based on your preference.
5.  **Reset**: Use the factory reset button to restore default settings if needed.

### On-Page Interactions

-   **Edit Translation**: Click any translation bubble to modify the text.
-   **Remove Word**: Click the highlighted word itself to delete it from your vocabulary.
-   **Hover to View**: Hover over any highlighted word to see its translation.

## 🛠 Local Development

The project is built with vanilla HTML/CSS/JS for maximum performance and zero dependencies.

### Structure

-   `manifest.json`: Extension configuration (Manifest V3).
-   `main/`:
    -   `content.js`: Handles text selection, highlighting, and DOM manipulation.
    -   `background.js`: Manages translation API calls.
    -   `styles.css`: Shared styles for content injection.
-   `popup/`: Browser action popup UI for vocabulary management.
-   `settings/`: Settings page for extension configuration.

### Building

No build step is required! Just edit the files and click the **Refresh** icon on the extension card in `chrome://extensions/` to see changes.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
