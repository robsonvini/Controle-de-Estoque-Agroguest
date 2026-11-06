import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { ADMIN_E2E } from './preparar';

export async function entrar(page: Page) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(ADMIN_E2E.email);
  await page.getByLabel('Senha').fill(ADMIN_E2E.senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
}

/** Verificação automática WCAG 2.2 AA (axe-core). Falha em qualquer violação. */
export async function verificarAcessibilidade(page: Page, contexto: string) {
  const resultado = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    // Gráficos SVG da biblioteca de charts são decorativos (aria-hidden) e têm tabela alternativa
    .exclude('.recharts-wrapper')
    .analyze();
  const violacoes = resultado.violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help} → ${v.nodes
        .map((n) => n.target.join(' '))
        .slice(0, 3)
        .join(' | ')}`,
  );
  expect(violacoes, `Violações de acessibilidade em ${contexto}`).toEqual([]);
}
