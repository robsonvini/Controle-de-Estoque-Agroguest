/**
 * Seed de dados de REFERÊNCIA (idempotente). Não cria dados fictícios de negócio:
 * apenas permissões, perfis padrão, unidades de medida usuais, configuração
 * inicial da integração e o administrador inicial definido no .env.
 */
import 'dotenv/config';
import { hash } from '@node-rs/argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  CONFIGURACOES_PADRAO,
  PERFIS_PADRAO,
  PERMISSOES,
  senhaForteSchema,
  type Permissao,
} from '@estoque/shared';
import { PrismaClient } from '../src/generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const UNIDADES: { sigla: string; nome: string; casasDecimais: number }[] = [
  { sigla: 'UN', nome: 'Unidade', casasDecimais: 0 },
  { sigla: 'PC', nome: 'Peça', casasDecimais: 0 },
  { sigla: 'CX', nome: 'Caixa', casasDecimais: 0 },
  { sigla: 'PCT', nome: 'Pacote', casasDecimais: 0 },
  { sigla: 'SC', nome: 'Saco', casasDecimais: 0 },
  { sigla: 'KG', nome: 'Quilograma', casasDecimais: 3 },
  { sigla: 'G', nome: 'Grama', casasDecimais: 2 },
  { sigla: 'T', nome: 'Tonelada', casasDecimais: 4 },
  { sigla: 'L', nome: 'Litro', casasDecimais: 3 },
  { sigla: 'ML', nome: 'Mililitro', casasDecimais: 2 },
  { sigla: 'M', nome: 'Metro', casasDecimais: 3 },
  { sigla: 'M2', nome: 'Metro quadrado', casasDecimais: 3 },
];

async function main() {
  // Permissões (sincroniza com o catálogo do código)
  for (const [codigo, descricao] of Object.entries(PERMISSOES)) {
    await prisma.permissao.upsert({
      where: { codigo },
      update: { descricao, modulo: codigo.split(':')[0]! },
      create: { codigo, descricao, modulo: codigo.split(':')[0]! },
    });
  }
  console.log(`✔ ${Object.keys(PERMISSOES).length} permissões`);

  // Perfis padrão: criados se não existirem; o Administrador sempre recebe todas as permissões
  for (const perfil of PERFIS_PADRAO) {
    const existente = await prisma.perfil.findUnique({ where: { nome: perfil.nome } });
    if (!existente) {
      await prisma.perfil.create({
        data: {
          nome: perfil.nome,
          descricao: perfil.descricao,
          sistema: true,
          permissoes: { create: perfil.permissoes.map((p: Permissao) => ({ permissaoCodigo: p })) },
        },
      });
    } else if (perfil.nome === 'Administrador') {
      await prisma.perfilPermissao.createMany({
        data: perfil.permissoes.map((p) => ({ perfilId: existente.id, permissaoCodigo: p })),
        skipDuplicates: true,
      });
    }
  }
  console.log(`✔ ${PERFIS_PADRAO.length} perfis padrão`);

  for (const u of UNIDADES) {
    await prisma.unidadeMedida.upsert({ where: { sigla: u.sigla }, update: {}, create: u });
  }
  console.log(`✔ ${UNIDADES.length} unidades de medida`);

  await prisma.configuracao.upsert({
    where: { chave: 'sistema' },
    update: {},
    create: { chave: 'sistema', valor: CONFIGURACOES_PADRAO },
  });

  await prisma.integracao.upsert({
    where: { codigo: 'crm-agrogest' },
    update: {},
    create: {
      codigo: 'crm-agrogest',
      nome: 'CRM Agrogest',
      ativo: false,
      baseUrl: process.env.CRM_BASE_URL ?? 'http://localhost:8000',
      timeoutMs: Number(process.env.CRM_TIMEOUT_MS ?? 10000),
      intervaloSyncMinutos: Number(process.env.CRM_SYNC_INTERVALO_MINUTOS ?? 15),
    },
  });
  console.log('✔ configurações e integração CRM');

  const email = process.env.SEED_ADMIN_EMAIL?.toLowerCase();
  const senha = process.env.SEED_ADMIN_SENHA;
  if (email && senha) {
    const valida = senhaForteSchema.safeParse(senha);
    if (!valida.success) {
      throw new Error(
        `SEED_ADMIN_SENHA não atende à política: ${valida.error.issues.map((i) => i.message).join('; ')}`,
      );
    }
    const existe = await prisma.usuario.findUnique({ where: { email } });
    if (!existe) {
      const perfil = await prisma.perfil.findUniqueOrThrow({ where: { nome: 'Administrador' } });
      await prisma.usuario.create({
        data: {
          nome: process.env.SEED_ADMIN_NOME ?? 'Administrador',
          email,
          perfilId: perfil.id,
          senhaHash: await hash(senha, { memoryCost: 19456, timeCost: 2, parallelism: 1 }),
          deveTrocarSenha: true,
        },
      });
      console.log(
        `✔ administrador inicial criado: ${email} (troca de senha obrigatória no 1º acesso)`,
      );
    } else {
      console.log(`• administrador ${email} já existe`);
    }
  } else {
    console.log('• SEED_ADMIN_EMAIL/SEED_ADMIN_SENHA não definidos: nenhum usuário criado');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
