import { z } from 'zod';

// Mensagens de validação padrão em português
z.config(z.locales.pt());

export * from './permissoes';
export * from './enums';
export * from './documentos';
export * from './formatacao';
export * from './schemas/comum';
export * from './schemas/auth';
export * from './schemas/cadastros';
export * from './schemas/estoque';
export * from './schemas/integracao';
export * from './schemas/sistema';
