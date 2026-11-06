'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { FolderTree, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { categoriaSchema } from '@estoque/shared';
import {
  CabecalhoPagina,
  Carregando,
  Cartao,
  ErroCarregamento,
  Etiqueta,
  Vazio,
} from '@/components/ui/basicos';
import { Botao } from '@/components/ui/botao';
import { AreaTexto, Caixa, Campo, Entrada, Selecao } from '@/components/ui/campos';
import { Confirmacao, Dialogo } from '@/components/ui/dialogo';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCategorias, useConsulta, type NoCategoria } from '@/lib/hooks';
import { tratarErro } from '@/lib/utils';

type Form = z.input<typeof categoriaSchema>;

function Arvore({
  nos,
  nivel,
  aoEditar,
  aoExcluir,
  aoAdicionarFilha,
  podeEditar,
}: {
  nos: NoCategoria[];
  nivel: number;
  aoEditar: (n: NoCategoria) => void;
  aoExcluir: (n: NoCategoria) => void;
  aoAdicionarFilha: (n: NoCategoria) => void;
  podeEditar: boolean;
}) {
  return (
    <ul
      role={nivel === 1 ? 'tree' : 'group'}
      aria-label={nivel === 1 ? 'Categorias e subcategorias' : undefined}
      className={nivel > 1 ? 'ml-6 border-l border-gray-200 pl-3' : ''}
    >
      {nos.map((n) => (
        <li
          key={n.id}
          role="treeitem"
          aria-level={nivel}
          aria-expanded={n.filhas.length ? true : undefined}
          aria-selected={false}
        >
          <div className="flex items-center justify-between gap-2 rounded px-2 py-1.5 hover:bg-gray-50">
            <span className="flex items-center gap-2">
              <FolderTree className="h-4 w-4 text-marca-700" aria-hidden />
              <span className="font-medium">{n.nome}</span>
              {!n.ativo && <Etiqueta>Inativa</Etiqueta>}
            </span>
            {podeEditar && (
              <span className="flex gap-1">
                <Botao
                  variante="fantasma"
                  tamanho="sm"
                  onClick={() => aoAdicionarFilha(n)}
                  aria-label={`Adicionar subcategoria em ${n.nome}`}
                >
                  <Plus className="h-4 w-4" aria-hidden /> Sub
                </Botao>
                <Botao
                  variante="fantasma"
                  tamanho="icone"
                  onClick={() => aoEditar(n)}
                  aria-label={`Editar ${n.nome}`}
                >
                  <Pencil className="h-4 w-4" aria-hidden />
                </Botao>
                <Botao
                  variante="fantasma"
                  tamanho="icone"
                  onClick={() => aoExcluir(n)}
                  aria-label={`Excluir ${n.nome}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Botao>
              </span>
            )}
          </div>
          {n.filhas.length > 0 && (
            <Arvore
              nos={n.filhas}
              nivel={nivel + 1}
              aoEditar={aoEditar}
              aoExcluir={aoExcluir}
              aoAdicionarFilha={aoAdicionarFilha}
              podeEditar={podeEditar}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

export default function PaginaCategorias() {
  const { tem } = useAuth();
  const qc = useQueryClient();
  const {
    data: arvore,
    isLoading,
    error,
    refetch,
  } = useConsulta<NoCategoria[]>('/categorias/arvore');
  const { data: lista } = useCategorias();
  const [editando, setEditando] = useState<{ id?: string } | null>(null);
  const [excluindo, setExcluindo] = useState<NoCategoria | null>(null);
  const form = useForm<Form, unknown, z.output<typeof categoriaSchema>>({
    resolver: zodResolver(categoriaSchema),
  });
  const e = form.formState.errors;

  const abrir = (valores: Form, id?: string) => {
    form.reset(valores);
    setEditando({ id });
  };
  const atualizar = () => qc.invalidateQueries({ queryKey: ['/categorias/arvore'] });

  return (
    <>
      <CabecalhoPagina
        titulo="Categorias"
        descricao="Organização dos produtos em categorias e subcategorias"
        acoes={
          tem('categorias:escrever') && (
            <Botao
              icone={<Plus className="h-4 w-4" aria-hidden />}
              onClick={() => abrir({ nome: '', paiId: '', ativo: true })}
            >
              Nova categoria
            </Botao>
          )
        }
      />
      <Cartao>
        {isLoading ? (
          <Carregando />
        ) : error ? (
          <ErroCarregamento erro={error} tentarNovamente={refetch} />
        ) : !arvore?.length ? (
          <Vazio texto="Nenhuma categoria cadastrada." />
        ) : (
          <Arvore
            nos={arvore}
            nivel={1}
            podeEditar={tem('categorias:escrever')}
            aoEditar={(n) =>
              abrir(
                {
                  nome: n.nome,
                  descricao: (n as NoCategoria & { descricao?: string }).descricao ?? '',
                  paiId: (n as NoCategoria & { paiId?: string }).paiId ?? '',
                  ativo: n.ativo,
                },
                n.id,
              )
            }
            aoAdicionarFilha={(n) => abrir({ nome: '', paiId: n.id, ativo: true })}
            aoExcluir={setExcluindo}
          />
        )}
      </Cartao>

      <Dialogo
        aberto={!!editando}
        aoMudar={(a) => !a && setEditando(null)}
        titulo={editando?.id ? 'Editar categoria' : 'Nova categoria'}
      >
        <form
          noValidate
          className="space-y-3"
          onSubmit={form.handleSubmit(async (dados) => {
            try {
              await api(editando?.id ? `/categorias/${editando.id}` : '/categorias', {
                metodo: editando?.id ? 'PUT' : 'POST',
                corpo: dados,
              });
              toast.success('Categoria salva.');
              setEditando(null);
              await atualizar();
            } catch (erro) {
              tratarErro(erro, form.setError);
            }
          })}
        >
          <Campo rotulo="Nome" erro={e.nome?.message} obrigatorio>
            <Entrada {...form.register('nome')} />
          </Campo>
          <Campo
            rotulo="Categoria superior"
            erro={e.paiId?.message}
            dica="Deixe em branco para uma categoria principal"
          >
            <Selecao {...form.register('paiId')}>
              <option value="">Nenhuma (categoria principal)</option>
              {lista
                ?.filter((c) => c.id !== editando?.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.caminho}
                  </option>
                ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Descrição" erro={e.descricao?.message}>
            <AreaTexto rows={2} {...form.register('descricao')} />
          </Campo>
          <Caixa rotulo="Ativa" {...form.register('ativo')} />
          <div className="flex justify-end">
            <Botao type="submit" carregando={form.formState.isSubmitting}>
              Salvar
            </Botao>
          </div>
        </form>
      </Dialogo>

      <Confirmacao
        aberto={!!excluindo}
        aoMudar={(a) => !a && setExcluindo(null)}
        titulo="Excluir categoria"
        mensagem={`Excluir "${excluindo?.nome}"? Categorias em uso não podem ser excluídas — desative-as.`}
        rotuloConfirmar="Excluir"
        perigo
        aoConfirmar={async () => {
          try {
            await api(`/categorias/${excluindo!.id}`, { metodo: 'DELETE' });
            toast.success('Categoria excluída.');
            await atualizar();
          } catch (erro) {
            tratarErro(erro);
            throw erro;
          }
        }}
      />
    </>
  );
}
