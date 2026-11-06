import { expect, test } from '@playwright/test';
import { entrar, verificarAcessibilidade } from './apoio';

test.describe.configure({ mode: 'serial' });

test('login acessível e mensagens de erro compreensíveis', async ({ page }) => {
  await page.goto('/login');
  await verificarAcessibilidade(page, 'login');
  await page.getByLabel('E-mail').fill('admin.e2e@agrogest.local');
  await page.getByLabel('Senha').fill('senha-errada');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'E-mail ou senha inválidos' }),
  ).toBeVisible();
});

test('navegação por teclado: link para pular ao conteúdo', async ({ page }) => {
  await entrar(page);
  await page.keyboard.press('Tab');
  const pular = page.getByRole('link', { name: 'Pular para o conteúdo' });
  await expect(pular).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#conteudo')).toBeFocused();
});

test('fluxo completo: local → produto → entrada → saída com saldo validado', async ({ page }) => {
  await entrar(page);

  // Local de armazenamento
  await page.goto('/estoque');
  await page.getByRole('tab', { name: 'Locais de armazenamento' }).click();
  await page.getByRole('button', { name: 'Novo local' }).click();
  const dialogo = page.getByRole('dialog');
  await dialogo.getByLabel('Código').fill('DEP-E2E');
  await dialogo.getByRole('textbox', { name: 'Nome', exact: true }).fill('Depósito E2E');
  await dialogo.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('cell', { name: 'DEP-E2E', exact: true })).toBeVisible();

  // Produto
  await page.goto('/produtos/novo');
  await page.getByLabel('Código interno').fill('E2E-001');
  await page.getByLabel('SKU').fill('E2E-SEMENTE');
  await page.getByRole('textbox', { name: 'Nome', exact: true }).fill('Semente E2E');
  await page.getByLabel('Unidade de medida').selectOption({ label: 'UN — Unidade' });
  await page.getByLabel('Estoque mínimo').fill('5');
  await page.getByLabel('Preço de custo (R$)').fill('10');
  await verificarAcessibilidade(page, 'cadastro de produto');
  await page.getByRole('button', { name: 'Cadastrar produto' }).click();
  await expect(page.getByRole('heading', { name: 'Semente E2E', level: 1 })).toBeVisible();

  // Validação no formulário: campo obrigatório
  await page.goto('/entradas/nova');
  await page.getByRole('button', { name: 'Registrar entrada' }).click();
  await expect(page.getByText('Informe o fornecedor')).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Fornecedor' })).toHaveAttribute(
    'aria-invalid',
    'true',
  );

  // Entrada por devolução de cliente (não exige fornecedor)
  await page.getByLabel('Motivo').selectOption({ label: 'Devolução de cliente' });
  await page.getByRole('combobox', { name: 'Produto do item 1' }).fill('E2E-SEM');
  await page.getByRole('option', { name: /E2E-SEMENTE/ }).click();
  await page
    .getByRole('combobox', { name: 'Local', exact: true })
    .selectOption({ label: 'DEP-E2E — Depósito E2E' });
  await page.getByLabel(/^Quantidade/).fill('12');
  await verificarAcessibilidade(page, 'nova entrada');
  await page.getByRole('button', { name: 'Registrar entrada' }).click();
  await expect(page.getByRole('heading', { name: /Movimentação nº/ })).toBeVisible();

  // Saída acima do saldo é recusada com mensagem clara
  await page.goto('/saidas/nova');
  await page.getByRole('combobox', { name: 'Produto do item 1' }).fill('E2E-SEM');
  await page.getByRole('option', { name: /E2E-SEMENTE/ }).click();
  await page.getByLabel('Local de saída').selectOption({ label: 'DEP-E2E — Depósito E2E' });
  await page.getByLabel(/^Quantidade/).fill('50');
  await page.getByRole('button', { name: 'Registrar saída' }).click();
  await expect(page.getByText(/Saldo disponível insuficiente/)).toBeVisible();

  // Saída válida
  await page.getByLabel(/^Quantidade/).fill('10');
  await page.getByRole('button', { name: 'Registrar saída' }).click();
  await expect(page.getByRole('heading', { name: /Movimentação nº/ })).toBeVisible();

  // Saldo refletido no produto (12 - 10 = 2, abaixo do mínimo 5)
  await page.goto('/produtos?busca=E2E-SEMENTE');
  await expect(page.getByRole('cell', { name: /2 UN/ })).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Lista de produtos' }).getByText('Estoque baixo'),
  ).toBeVisible();
});

const PAGINAS = [
  ['/dashboard', 'Dashboard'],
  ['/produtos', 'Produtos'],
  ['/estoque', 'Estoque'],
  ['/entradas', 'Entradas'],
  ['/saidas', 'Saídas'],
  ['/compras', 'Compras'],
  ['/pedidos', 'Pedidos de venda'],
  ['/inventario', 'Inventário e ajustes'],
  ['/fornecedores', 'Fornecedores'],
  ['/relatorios', 'Relatórios gerenciais'],
  ['/integracao', 'Integração com o CRM Agrogest'],
  ['/usuarios', 'Usuários e permissões'],
  ['/configuracoes', 'Configurações'],
] as const;

for (const [caminho, titulo] of PAGINAS) {
  test(`acessibilidade WCAG 2.2 AA: ${titulo}`, async ({ page }) => {
    await entrar(page);
    await page.goto(caminho);
    await expect(page.getByRole('heading', { name: titulo, level: 1 })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await verificarAcessibilidade(page, titulo);
  });
}
