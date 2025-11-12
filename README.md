# DocAIMaster

> AI-powered document editing, modification, and validation tool

[中文文档](./README.zh-CN.md)

## Overview

DocAIMaster is a sophisticated desktop application built with Next.js and React, designed to provide AI-powered document validation and editing capabilities. The application features a clean, elegant interface inspired by Apple's design language with a modern neo-brutalism aesthetic.

## Features

- 🤖 **AI Document Validation** - Intelligent document checking and validation using LLM APIs
- 🎨 **Beautiful UI** - Clean, modern interface with neo-brutalism design system
- 🌍 **Internationalization** - Built-in support for multiple languages (English, Chinese)
- 📝 **Detailed Logging** - Comprehensive logging system for debugging and monitoring
- 🖥️ **Desktop Application** - Native Windows desktop app with Electron (1024×768 default, 800×600 minimum)
- 📦 **Easy Distribution** - One-click installer and portable executable for Windows

## Technology Stack

- **Framework**: Next.js 16 with App Router
- **UI Library**: React 19
- **Desktop**: Electron 28 with secure IPC bridge
- **Styling**: Tailwind CSS 4 with custom neo-brutalism theme
- **TypeScript**: Full type safety
- **Icons**: Lucide React
- **Internationalization**: Custom i18n implementation
- **Build Tools**: Electron Builder for Windows packaging

## Getting Started

### Prerequisites

- Node.js 20+ 
- npm or yarn

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd AIDocMaster
```

2. Install dependencies:

```bash
npm install
```

3. Set up environment variables:

```bash
cp .env.example .env.local
```

Edit `.env.local` and add your LLM API credentials:

```env
LLM_API_KEY=your_api_key_here
LLM_API_URL=your_api_url_here
LLM_MODEL_NAME=gpt-4
LLM_API_TIMEOUT=30000
```

### Development

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.

### Build

#### Web Application Build

Create a production build:

```bash
npm run build
```

Start the production server:

```bash
npm start
```

#### Desktop Application Build

Build as a Windows desktop application:

```bash
# Verify setup first (recommended)
npm run verify:desktop

# Build desktop application
npm run build:desktop
```

Output files will be in the `dist` directory:
- `AIDocMaster-{version}-Setup.exe` - NSIS installer
- `AIDocMaster-{version}-Portable.exe` - Portable executable

For more details, see [Desktop Packaging Documentation](./docs/features/desktop-packaging.md).

## Project Structure

```
AIDocMaster/
├── app/                    # Next.js app directory
│   ├── layout.tsx         # Root layout
│   ├── page.tsx           # Home page
│   └── globals.css        # Global styles with theme
├── components/            # React components
│   ├── Header.tsx         # Top navigation bar
│   ├── Footer.tsx         # Bottom footer
│   ├── Taskbar.tsx        # Vertical task navigation
│   └── Container.tsx      # Main content area
├── electron/              # Electron desktop application
│   ├── main.js           # Main process (window management)
│   └── preload.js        # Preload script (IPC bridge)
├── scripts/               # Build and automation scripts
│   ├── build-desktop.js  # Desktop packaging script
│   ├── verify-desktop-setup.js # Setup verification
│   └── README.md         # Scripts documentation
├── lib/                   # Utility libraries
│   ├── utils.ts           # Helper functions
│   ├── logger.ts          # Logging utility
│   └── i18n/              # Internationalization
│       ├── config.ts      # i18n configuration
│       └── dictionaries.ts # Translation dictionaries
├── docs/                  # Documentation
│   ├── features/         # Feature documentation
│   │   ├── desktop-packaging.md        # Desktop feature guide
│   │   ├── desktop-quick-start.md      # Quick start guide
│   │   └── desktop-installation-guide.md # Installation guide
│   └── apis/             # API documentation
├── public/                # Static assets
├── electron-builder.json  # Electron Builder configuration
├── .env.example           # Environment variables template
└── package.json           # Project dependencies
```

## Architecture

### Layout Structure

The application uses a fixed-height layout designed for desktop applications:

```
┌─────────────────────────────────┐
│          Header                  │
├────┬────────────────────────────┤
│    │                             │
│ T  │                             │
│ a  │       Container             │
│ s  │                             │
│ k  │                             │
│ b  │                             │
│ a  │                             │
│ r  │                             │
│    │                             │
├────┴────────────────────────────┤
│          Footer                  │
└─────────────────────────────────┘
```

### Key Components

- **Header**: Top navigation bar with application title
- **Taskbar**: Vertical sidebar on the left with task icons and tooltips
- **Container**: Main content area for displaying active task content
- **Footer**: Bottom bar with copyright information

### Theme System

The project uses a custom neo-brutalism theme with:
- Bold borders (4px)
- Strong shadows
- High contrast colors
- Clean typography (DM Sans, Space Mono)
- OKLCH color space for better color perception

### Internationalization

The i18n system supports multiple languages with:
- Dictionary-based translations
- Type-safe translation keys
- Easy language switching capability

### Logging

Comprehensive logging system with:
- Multiple log levels (info, warn, error, debug, success)
- Contextual logging
- Component lifecycle tracking
- API call logging
- Development/production mode awareness

## Configuration

### Environment Variables

See `.env.example` for all available configuration options.

### Theme Customization

Edit `app/globals.css` to customize the color scheme and design tokens.

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)

**Note**: This application is designed for desktop use only. Mobile access will redirect to desktop view.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is proprietary software. All rights reserved.

## Support

For support, please open an issue in the GitHub repository.

---

Built with ❤️ using Next.js and React
