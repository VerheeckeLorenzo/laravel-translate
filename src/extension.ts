import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

interface TranslationResult {
  value: string;
  filePath: string;
  line: number;
  column: number;
}

interface ParsedTranslations {
  [key: string]: any;
}

export function activate(context: vscode.ExtensionContext) {
  // Cache for parsed translation files
  const translationCache = new Map<string, ParsedTranslations>();

  // Helper function to get translation key range
  function getTranslationKeyRange(document: vscode.TextDocument, position: vscode.Position): vscode.Range | null {
    return document.getWordRangeAtPosition(position, /__\(['"][\w.-]+['"]\)/) ?? null;
  }

  // Helper function to extract translation key from text
  function extractTranslationKey(text: string): string | null {
    const match = text.match(/__\(['"]([\w.-]+)['"]\)/);
    return match ? match[1] : null;
  }

  // Helper function to get workspace language directory
  function getLangDirectory(locale: string = 'en'): string {
    return path.join(vscode.workspace.workspaceFolders?.[0].uri.fsPath || '', 'resources', 'lang', locale);
  }

  // Helper function to parse PHP array content
  function parsePhpArray(content: string): ParsedTranslations {
    try {
      // Remove PHP opening/closing tags and return statement
      let cleaned = content
        .replace(/^<\?php\s*/gm, '')
        .replace(/\?>/g, '')
        .replace(/^\s*return\s+/gm, '')
        .replace(/;\s*$/gm, '');

      // Simple PHP array parser for basic cases
      // This is a simplified parser - for production, consider using a proper PHP parser
      const result: ParsedTranslations = {};
      
      // Match array entries like 'key' => 'value' or "key" => "value"
      const arrayPattern = /(['"])((?:\\.|(?!\1)[^\\])*?)\1\s*=>\s*(['"])((?:\\.|(?!\3)[^\\])*?)\3/g;
      let match;

      while ((match = arrayPattern.exec(cleaned)) !== null) {
        const key = match[2];
        const value = match[4];
        result[key] = value;
      }

      // Handle nested arrays (simplified)
      const nestedPattern = /(['"])((?:\\.|(?!\1)[^\\])*?)\1\s*=>\s*\[([\s\S]*?)\]/g;
      while ((match = nestedPattern.exec(cleaned)) !== null) {
        const key = match[2];
        const nestedContent = match[3];
        result[key] = parsePhpArray(`[${nestedContent}]`);
      }

      return result;
    } catch (error) {
      console.error('Error parsing PHP array:', error);
      return {};
    }
  }

  // Helper function to get translation value from nested object
  function getNestedValue(obj: any, keyPath: string): string | null {
    const keys = keyPath.split('.');
    let current = obj;

    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return null;
      }
    }

    return typeof current === 'string' ? current : null;
  }

  // Helper function to find translation in file content
  function findTranslationInContent(content: string, keyPath: string): { line: number; column: number } | null {
    const lines = content.split('\n');
    const keys = keyPath.split('.');
    
    // Try to find the exact key location
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Look for the final key in the path
      const finalKey = keys[keys.length - 1];
      if (line.includes(`'${finalKey}'`) || line.includes(`"${finalKey}"`)) {
        const column = Math.max(
          line.indexOf(`'${finalKey}'`),
          line.indexOf(`"${finalKey}"`)
        );
        if (column >= 0) {
          return { line: i, column };
        }
      }
    }

    return null;
  }

  // Helper function to resolve translation
  function resolveTranslation(translationKey: string): TranslationResult | null {
    const [file, ...rest] = translationKey.split('.');
    const keyPath = rest.join('.');

    const langDir = getLangDirectory();
    const filePath = path.join(langDir, `${file}.php`);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    // Check cache first
    const cacheKey = filePath;
    let translations = translationCache.get(cacheKey);

    if (!translations) {
      const content = fs.readFileSync(filePath, 'utf-8');
      translations = parsePhpArray(content);
      translationCache.set(cacheKey, translations);
    }

    const value = getNestedValue(translations, keyPath);
    if (!value) {
      return null;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const location = findTranslationInContent(content, keyPath);

    return {
      value,
      filePath,
      line: location?.line || 0,
      column: location?.column || 0
    };
  }

  // Helper function to get all available locales
  function getAvailableLocales(): string[] {
    const langDir = path.dirname(getLangDirectory());
    try {
      return fs.readdirSync(langDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);
    } catch {
      return ['en'];
    }
  }

  // Helper function to get translations for all locales
  function getAllTranslations(translationKey: string): { [locale: string]: string } {
    const [file] = translationKey.split('.');
    const locales = getAvailableLocales();
    const translations: { [locale: string]: string } = {};

    for (const locale of locales) {
      const result = resolveTranslationForLocale(translationKey, locale);
      if (result) {
        translations[locale] = result.value;
      }
    }

    return translations;
  }

  // Helper function to resolve translation for specific locale
  function resolveTranslationForLocale(translationKey: string, locale: string): TranslationResult | null {
    const [file, ...rest] = translationKey.split('.');
    const keyPath = rest.join('.');

    const langDir = getLangDirectory(locale);
    const filePath = path.join(langDir, `${file}.php`);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    const cacheKey = `${locale}:${filePath}`;
    let translations = translationCache.get(cacheKey);

    if (!translations) {
      const content = fs.readFileSync(filePath, 'utf-8');
      translations = parsePhpArray(content);
      translationCache.set(cacheKey, translations);
    }

    const value = getNestedValue(translations, keyPath);
    if (!value) {
      return null;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const location = findTranslationInContent(content, keyPath);

    return {
      value,
      filePath,
      line: location?.line || 0,
      column: location?.column || 0
    };
  }

  // Definition Provider (enhanced)
  const definitionProvider = vscode.languages.registerDefinitionProvider(
    [{ language: 'php' }, { language: 'blade' }],
    {
      provideDefinition(document, position, token) {
        const range = getTranslationKeyRange(document, position);
        if (!range) return;

        const word = document.getText(range);
        const translationKey = extractTranslationKey(word);
        if (!translationKey) return;

        const result = resolveTranslation(translationKey);
        if (!result) return;

        const uri = vscode.Uri.file(result.filePath);
        const pos = new vscode.Position(result.line, result.column);
        return new vscode.Location(uri, pos);
      },
    }
  );

  // Hover Provider (new)
  const hoverProvider = vscode.languages.registerHoverProvider(
    [{ language: 'php' }, { language: 'blade' }],
    {
      provideHover(document, position, token) {
        const range = getTranslationKeyRange(document, position);
        if (!range) return;

        const word = document.getText(range);
        const translationKey = extractTranslationKey(word);
        if (!translationKey) return;

        const allTranslations = getAllTranslations(translationKey);
        
        if (Object.keys(allTranslations).length === 0) {
          return new vscode.Hover(
            new vscode.MarkdownString(`**Translation not found:** \`${translationKey}\``),
            range
          );
        }

        // Create hover content
        const markdown = new vscode.MarkdownString();
        markdown.isTrusted = true;

        markdown.appendMarkdown(`**Translation Key:** \`${translationKey}\`\n\n`);

        // Show translations for each locale
        Object.entries(allTranslations).forEach(([locale, translation]) => {
          const flag = getLocaleFlag(locale);
          markdown.appendMarkdown(`${flag} **${locale.toUpperCase()}:** ${translation}\n\n`);
        });

        return new vscode.Hover(markdown, range);
      },
    }
  );

  // Helper function to get locale flag emoji
  function getLocaleFlag(locale: string): string {
    const flags: { [key: string]: string } = {
      'en': '🇺🇸',
      'es': '🇪🇸',
      'fr': '🇫🇷',
      'de': '🇩🇪',
      'it': '🇮🇹',
      'pt': '🇵🇹',
      'nl': '🇳🇱',
      'ru': '🇷🇺',
      'ja': '🇯🇵',
      'ko': '🇰🇷',
      'zh': '🇨🇳',
    };
    return flags[locale] || '🌐';
  }

  // Register providers
  context.subscriptions.push(definitionProvider);
  context.subscriptions.push(hoverProvider);

  // Clear cache when translation files change
  const watcher = vscode.workspace.createFileSystemWatcher('**/resources/lang/**/*.php');
  
  watcher.onDidChange(() => {
    translationCache.clear();
  });
  
  watcher.onDidCreate(() => {
    translationCache.clear();
  });
  
  watcher.onDidDelete(() => {
    translationCache.clear();
  });

  context.subscriptions.push(watcher);
}

export function deactivate() {}
