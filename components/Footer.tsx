/**
 * Footer Component
 * Bottom bar showing copyright and additional information
 */

'use client';

import { logger } from '@/lib/logger';
import { useEffect } from 'react';

interface FooterProps {
  copyright: string;
}

const Footer = ({ copyright }: FooterProps) => {
  useEffect(() => {
    logger.component('Footer', 'mounted');
  }, []);

  return (
    <footer className="h-6 bg-muted border-t-4 border-border flex items-center justify-center px-6">
      <p className="text-sm text-muted-foreground">{copyright}</p>
    </footer>
  );
};

export default Footer;









