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
  console.log('Laravel Translations extension activated');
  
  // Add debug logging
  const outputChannel = vscode.window.createOutputChannel("Laravel Translations Debug");
  outputChannel.appendLine('Extension activated');
  outputChannel.show();
  
  try {
    // Cache for parsed translation files
    const translationCache = new Map<string, ParsedTranslations>();

    // Helper function to get translation key range - FIXED REGEX
    function getTranslationKeyRange(document: vscode.TextDocument, position: vscode.Position): vscode.Range | null {
      // More comprehensive regex patterns for different Laravel translation syntaxes
      const patterns = [
        /__\(['"][\w.-]+['"]\)/,           // __('key')
        /__\(["'][\w.-]+["']\)/,           // Alternative quotes
        /trans\(['"][\w.-]+['"]\)/,        // trans('key')
        /trans\(["'][\w.-]+["']\)/,        // trans alternative
        /@lang\(['"][\w.-]+['"]\)/,        // @lang('key') in Blade
        /@lang\(["'][\w.-]+["']\)/         // @lang alternative
      ];

      for (const pattern of patterns) {
        const range = document.getWordRangeAtPosition(position, pattern);
        if (range) {
          outputChannel.appendLine(`Found translation at range: ${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}`);
          return range;
        }
      }
      return null;
    }

    // Helper function to extract translation key from text - ENHANCED
    function extractTranslationKey(text: string): string | null {
      outputChannel.appendLine(`Extracting key from: ${text}`);
      
      const patterns = [
        /__\(['"]([\w.-]+)['"]\)/,
        /trans\(['"]([\w.-]+)['"]\)/,
        /@lang\(['"]([\w.-]+)['"]\)/
      ];

      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
          outputChannel.appendLine(`Extracted key: ${match[1]}`);
          return match[1];
        }
      }
      
      outputChannel.appendLine('No key found');
      return null;
    }

    // Helper function to get workspace language directory - ENHANCED
    function getLangDirectory(locale: string = 'en'): string {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath || '';
      outputChannel.appendLine(`Workspace root: ${workspaceRoot}`);
      
      // Common Laravel language directory patterns
      const possiblePaths = [
        path.join(workspaceRoot, 'test-project', 'lang', locale),  // Your test path
        path.join(workspaceRoot, 'lang', locale),                  // Laravel 9+
        path.join(workspaceRoot, 'resources', 'lang', locale),     // Laravel 8 and below
        path.join(workspaceRoot, 'resources', 'languages', locale), // Alternative
        path.join(workspaceRoot, 'app', 'lang', locale)            // Very old Laravel
      ];
      
      for (const testPath of possiblePaths) {
        outputChannel.appendLine(`Testing path: ${testPath}`);
        if (fs.existsSync(testPath)) {
          outputChannel.appendLine(`Found language directory: ${testPath}`);
          return testPath;
        }
      }
      
      // Default fallback
      const defaultPath = path.join(workspaceRoot, 'lang', locale);
      outputChannel.appendLine(`Using default path: ${defaultPath}`);
      return defaultPath;
    }

    // Helper function to parse PHP array content - ENHANCED
    function parsePhpArray(content: string): ParsedTranslations {
      try {
        outputChannel.appendLine('Parsing PHP array content...');
        
        // Remove PHP opening/closing tags and return statement
        let cleaned = content
          .replace(/^<\?php\s*/gm, '')
          .replace(/\?>/g, '')
          .replace(/^\s*return\s+/gm, '')
          .replace(/;\s*$/gm, '')
          .trim();

        // Remove leading/trailing array brackets if present
        cleaned = cleaned.replace(/^\[/, '').replace(/\]$/, '');
        
        outputChannel.appendLine(`Cleaned content: ${cleaned.substring(0, 200)}...`);

        const result: ParsedTranslations = {};
        
        // Enhanced regex for array entries with better quote handling
        const arrayPattern = /(['"`])((?:\\.|(?!\1)[^\\])*?)\1\s*=>\s*(['"`])((?:\\.|(?!\3)[^\\])*?)\3/g;
        let match;
        let matchCount = 0;

        while ((match = arrayPattern.exec(cleaned)) !== null) {
          const key = match[2];
          const value = match[4];
          result[key] = value;
          matchCount++;
          outputChannel.appendLine(`Found translation: ${key} => ${value}`);
        }

        outputChannel.appendLine(`Total translations found: ${matchCount}`);

        // Handle nested arrays (simplified)
        const nestedPattern = /(['"`])((?:\\.|(?!\1)[^\\])*?)\1\s*=>\s*\[([\s\S]*?)\]/g;
        while ((match = nestedPattern.exec(cleaned)) !== null) {
          const key = match[2];
          const nestedContent = match[3];
          result[key] = parsePhpArray(`[${nestedContent}]`);
          outputChannel.appendLine(`Found nested array: ${key}`);
        }

        return result;
      } catch (error) {
        outputChannel.appendLine(`Error parsing PHP array: ${error}`);
        console.error('Error parsing PHP array:', error);
        return {};
      }
    }

    // Helper function to get translation value from nested object
    function getNestedValue(obj: any, keyPath: string): string | null {
      outputChannel.appendLine(`Getting nested value for: ${keyPath}`);
      const keys = keyPath.split('.');
      let current = obj;

      for (const key of keys) {
        outputChannel.appendLine(`Looking for key: ${key} in object with keys: ${Object.keys(current || {})}`);
        if (current && typeof current === 'object' && key in current) {
          current = current[key];
        } else {
          outputChannel.appendLine(`Key not found: ${key}`);
          return null;
        }
      }

      const result = typeof current === 'string' ? current : null;
      outputChannel.appendLine(`Final value: ${result}`);
      return result;
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
        const patterns = [
          `'${finalKey}'`,
          `"${finalKey}"`,
          `\`${finalKey}\``
        ];
        
        for (const pattern of patterns) {
          const index = line.indexOf(pattern);
          if (index >= 0) {
            return { line: i, column: index };
          }
        }
      }

      return null;
    }

    // Helper function to resolve translation - ENHANCED WITH DEBUG
    function resolveTranslation(translationKey: string): TranslationResult | null {
      try {
        outputChannel.appendLine(`Resolving translation: ${translationKey}`);
        
        const [file, ...rest] = translationKey.split('.');
        const keyPath = rest.join('.');
        
        outputChannel.appendLine(`File: ${file}, KeyPath: ${keyPath}`);

        const langDir = getLangDirectory();
        const filePath = path.join(langDir, `${file}.php`);
        
        outputChannel.appendLine(`Looking for file: ${filePath}`);

        if (!fs.existsSync(filePath)) {
          outputChannel.appendLine(`Translation file not found: ${filePath}`);
          
          // List available files for debugging
          try {
            const files = fs.readdirSync(langDir);
            outputChannel.appendLine(`Available files in ${langDir}: ${files.join(', ')}`);
          } catch (e) {
            outputChannel.appendLine(`Cannot read directory: ${langDir}`);
          }
          
          return null;
        }

        // Check cache first
        const cacheKey = filePath;
        let translations = translationCache.get(cacheKey);

        if (!translations) {
          outputChannel.appendLine('Reading and parsing file...');
          const content = fs.readFileSync(filePath, 'utf-8');
          outputChannel.appendLine(`File content preview: ${content.substring(0, 200)}...`);
          translations = parsePhpArray(content);
          translationCache.set(cacheKey, translations);
        }

        const value = getNestedValue(translations, keyPath);
        if (!value) {
          outputChannel.appendLine(`Translation key not found: ${keyPath} in ${filePath}`);
          outputChannel.appendLine(`Available keys: ${Object.keys(translations || {}).join(', ')}`);
          return null;
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const location = findTranslationInContent(content, keyPath);

        const result = {
          value,
          filePath,
          line: location?.line || 0,
          column: location?.column || 0
        };
        
        outputChannel.appendLine(`Successfully resolved: ${JSON.stringify(result)}`);
        return result;
      } catch (error) {
        outputChannel.appendLine(`Error resolving translation: ${error}`);
        console.error('Error resolving translation:', error);
        return null;
      }
    }

    // Helper function to get all available locales
    function getAvailableLocales(): string[] {
      const langDir = path.dirname(getLangDirectory());
      try {
        if (!fs.existsSync(langDir)) {
          outputChannel.appendLine(`Language directory not found: ${langDir}`);
          return ['en'];
        }
        const locales = fs.readdirSync(langDir, { withFileTypes: true })
          .filter(dirent => dirent.isDirectory())
          .map(dirent => dirent.name);
        
        outputChannel.appendLine(`Available locales: ${locales.join(', ')}`);
        return locales;
      } catch (error) {
        outputChannel.appendLine(`Error reading language directories: ${error}`);
        console.error('Error reading language directories:', error);
        return ['en'];
      }
    }

    // Helper function to get translations for all locales
    function getAllTranslations(translationKey: string): { [locale: string]: string } {
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
      try {
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
      } catch (error) {
        outputChannel.appendLine(`Error resolving translation for locale ${locale}: ${error}`);
        console.error(`Error resolving translation for locale ${locale}:`, error);
        return null;
      }
    }

    // Definition Provider (enhanced with debug)
    const definitionProvider = vscode.languages.registerDefinitionProvider(
      [
        { language: 'php' }, 
        { language: 'blade' },
        { scheme: 'file', pattern: '**/*.php' },
        { scheme: 'file', pattern: '**/*.blade.php' }
      ],
      {
        provideDefinition(document, position, token) {
          try {
            outputChannel.appendLine(`Definition provider triggered at ${position.line}:${position.character}`);
            outputChannel.appendLine(`Document language: ${document.languageId}`);
            outputChannel.appendLine(`Document URI: ${document.uri.toString()}`);
            
            const range = getTranslationKeyRange(document, position);
            if (!range) {
              outputChannel.appendLine('No translation range found');
              return;
            }

            const word = document.getText(range);
            outputChannel.appendLine(`Found word: ${word}`);
            
            const translationKey = extractTranslationKey(word);
            if (!translationKey) {
              outputChannel.appendLine('No translation key extracted');
              return;
            }

            const result = resolveTranslation(translationKey);
            if (!result) {
              outputChannel.appendLine('Translation not resolved');
              return;
            }

            const uri = vscode.Uri.file(result.filePath);
            const pos = new vscode.Position(result.line, result.column);
            outputChannel.appendLine(`Returning location: ${result.filePath}:${result.line}:${result.column}`);
            return new vscode.Location(uri, pos);
          } catch (error) {
            outputChannel.appendLine(`Error in definition provider: ${error}`);
            console.error('Error in definition provider:', error);
            return;
          }
        },
      }
    );

    // Hover Provider (enhanced with debug)
    const hoverProvider = vscode.languages.registerHoverProvider(
      [
        { language: 'php' }, 
        { language: 'blade' },
        { scheme: 'file', pattern: '**/*.php' },
        { scheme: 'file', pattern: '**/*.blade.php' }
      ],
      {
        provideHover(document, position, token) {
          try {
            outputChannel.appendLine(`Hover provider triggered at ${position.line}:${position.character}`);
            
            const range = getTranslationKeyRange(document, position);
            if (!range) {
              outputChannel.appendLine('No translation range found for hover');
              return;
            }

            const word = document.getText(range);
            const translationKey = extractTranslationKey(word);
            if (!translationKey) {
              outputChannel.appendLine('No translation key extracted for hover');
              return;
            }

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

            outputChannel.appendLine(`Returning hover with ${Object.keys(allTranslations).length} translations`);
            return new vscode.Hover(markdown, range);
          } catch (error) {
            outputChannel.appendLine(`Error in hover provider: ${error}`);
            console.error('Error in hover provider:', error);
            return;
          }
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
    context.subscriptions.push(outputChannel);

    // Clear cache when translation files change
    const watcher = vscode.workspace.createFileSystemWatcher('**/lang/**/*.php');
    
    watcher.onDidChange(() => {
      outputChannel.appendLine('Translation file changed, clearing cache');
      console.log('Translation file changed, clearing cache');
      translationCache.clear();
    });
    
    watcher.onDidCreate(() => {
      outputChannel.appendLine('Translation file created, clearing cache');
      console.log('Translation file created, clearing cache');
      translationCache.clear();
    });
    
    watcher.onDidDelete(() => {
      outputChannel.appendLine('Translation file deleted, clearing cache');
      console.log('Translation file deleted, clearing cache');
      translationCache.clear();
    });

    context.subscriptions.push(watcher);

    outputChannel.appendLine('Extension fully initialized');
    
    // Show success message
    vscode.window.showInformationMessage('Laravel Translations extension activated successfully!');
    
  } catch (error) {
    console.error('Error activating Laravel Translations extension:', error);
    vscode.window.showErrorMessage(`Laravel Translations extension failed to activate: ${error}`);
  }
}

export function deactivate() {
  console.log('Laravel Translations extension deactivated');
}