import { expect, test } from '@playwright/test';
import { entrar, verificarAcessibilidade } from './apoio';

test('layout responsivo em celular: menu recolhível e navegação', async ({ page }) => {
  await entrar(page);
  const abrir = page.getByRole('button', { name: 'Abrir menu' });
  await expect(abrir).toBeVisible();
  await abrir.click();
  const menu = page.getByRole('dialog', { name: 'Menu de navegação' });
  await expect(menu).toBeVisible();
  await menu.getByRole('link', { name: 'Produtos' }).click();
  await expect(page.getByRole('heading', { name: 'Produtos', level: 1 })).toBeVisible();
  await verificarAcessibilidade(page, 'produtos (celular)');
});
