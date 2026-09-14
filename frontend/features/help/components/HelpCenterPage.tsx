import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../shared/auth/AuthProvider';
import { useWorkspace } from '../../../app/layouts/WorkspaceLayout';
export function Onboarding({ force = false }: { force?: boolean }) {
  const { user } = useAuth(); const { base } = useWorkspace(); const key = 'cd_onboarding_v1_' + user!.id;
  const [open, setOpen] = useState(force || !localStorage.getItem(key));
  if (!open) return null;
  return <aside className="card onboarding" aria-label="Primeiros passos"><h2>Seu primeiro projeto, passo a passo</h2><ol><li>Importe seus dados ou cadastre personagens.</li><li>Explore golpes e construa combos por personagem.</li><li>Execute análises e converse com o Combat Director.</li></ol><div className="actions"><Link to={base + '/import'}>Começar pela importação</Link><button type="button" onClick={() => { localStorage.setItem(key, JSON.stringify({ onboarding_version: 1, completed_at: new Date().toISOString() })); setOpen(false); }}>Concluir apresentação</button></div></aside>;
}
export function HelpCenter() {
  const [tour, setTour] = useState(0);
  return <section data-page="help"><h1>Ajuda</h1><p className="lead">Um guia permanente para seu processo de design.</p><button type="button" onClick={() => setTour(n => n + 1)}>Reiniciar apresentação</button>{tour > 0 && <Onboarding key={tour} force />}<article className="card"><h2>Como trabalhar</h2><p>Organize personagens, importe golpes e use o construtor para salvar sequências. Em Análises, solicite diagnósticos e consulte as recomendações. Em Simulação, acompanhe os eventos de combate.</p><p>O Combat Director ajuda a investigar seu projeto; as recomendações são consultivas e não alteram o projeto Unity.</p><h2>Frame data</h2><dl><dt>Startup</dt><dd>Frames de preparação antes de um golpe ficar ativo.</dd><dt>Active</dt><dd>Janela em que o golpe pode acertar.</dd><dt>Recovery</dt><dd>Tempo de recuperação até a próxima ação.</dd><dt>Cancelamento</dt><dd>Janela para interromper um movimento e encadear outro.</dd><dt>Hitstun e blockstun</dt><dd>Tempo em que o alvo permanece reagindo ao acerto ou bloqueio.</dd></dl><h2>Importação</h2><p>Envie um bundle JSON com manifesto e arquivos exportados. Itens inválidos podem precisar de revisão antes de entrar no catálogo.</p><h2>Conversas</h2><p>Selecione uma conversa no Director para continuar seu histórico. O projeto e a conversa fazem parte do link que você pode salvar.</p></article></section>;
}
