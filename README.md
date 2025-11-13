# DocAIMaster

> AI-powered document editing, modification, and validation tool

[中文文档](./README.zh-CN.md)

![202059.png](imgs/202059.png)


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

Contact me: xdrshjr@gmail.com

---

Built with ❤️ using Next.js and React
