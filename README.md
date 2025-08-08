# Laravel Translations

A Visual Studio Code extension that provides intelligent support for Laravel translation functions, enabling seamless navigation and preview of translation keys.

## Features

### 🔗 **Go to Definition**
- **Ctrl+Click** (or **Cmd+Click** on macOS) on any `__('translation.key')` to jump directly to the translation file
- Supports both simple and nested translation keys
- Works with both PHP and Blade files

### 🌐 **Multi-locale Hover Preview**
- **Hover** over translation keys to see translations for all available locales
- Visual flags for different languages
- Instant preview without leaving your current file

### 🎯 **Smart Key Resolution**
- Supports nested translation keys like `__('auth.failed')` and `__('shopify.exceptions.graphql')`
- Handles both dot-notation string keys and true nested PHP arrays
- Automatically detects Laravel's standard `resources/lang` directory structure

### ⚡ **Performance Optimized**
- Caches parsed translation files for fast access
- Automatically refreshes cache when translation files change
- Efficient parsing of PHP array structures

## Usage

### Basic Translation Keys
```php
// Hover or Ctrl+Click to navigate
__('auth.failed')           // → resources/lang/en/auth.php
__('validation.required')   // → resources/lang/en/validation.php
```

### Nested Translation Keys
```php
// Works with deeply nested keys
__('shopify.exceptions.graphql')      // → shopify.php → exceptions → graphql
__('admin.users.permissions.edit')   // → admin.php → users → permissions → edit
```

### Blade Templates
```blade
{{-- Also works in Blade files --}}
{{ __('welcome.title') }}
@lang('errors.404.message')
```

## Requirements

- **Laravel Project**: Must have a `resources/lang` directory structure
- **Translation Files**: PHP files in `resources/lang/{locale}/` directories
- **VS Code**: Version 1.60.0 or higher

## Supported File Types

- **PHP** files (`.php`)
- **Blade** templates (`.blade.php`)

## Translation File Structure

The extension supports both translation file formats:

### Simple Dot Notation
```php
<?php
return [
    'auth.failed' => 'These credentials do not match our records.',
    'validation.required' => 'The :attribute field is required.',
];
```

### Nested Arrays
```php
<?php
return [
    'auth' => [
        'failed' => 'These credentials do not match our records.',
        'throttle' => 'Too many login attempts.',
    ],
    'validation' => [
        'required' => 'The :attribute field is required.',
        'email' => 'The :attribute must be a valid email address.',
    ],
];
```

## Directory Structure


## Known Issues

- Complex PHP array structures with dynamic keys are not fully supported
- Only supports standard Laravel `__()` function syntax
- Requires translation files to be valid PHP arrays

## Release Notes

### 0.0.1

Initial release with the following features:
- Go to definition for Laravel translation keys
- Hover preview showing translations for all locales
- Support for nested translation keys
- Automatic cache management with file watching
- Support for both PHP and Blade files

---

## Contributing

Found a bug or have a feature request? Please open an issue on the [GitHub repository](https://github.com/your-username/laravel-translations).

**Enjoy translating! 🚀**