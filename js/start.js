// Запуск тренировки из любого места приложения.
import * as router from './router.js';
import { activeSession } from './store.js';
import { confirmDialog } from './ui.js';
import { unlockAudio } from './feedback.js';
import { t } from './i18n.js';
import { D } from './data.js';
import { canStartProgram } from './access.js';
import { sheet } from './ui.js';

export async function startPlan(plan) {
  const prog = plan.programId ? D.progById.get(plan.programId) : null;
  if (prog && !canStartProgram(prog)) { sheet({ title: t('premium.title'), body: [t('premium.text')] }); return; }
  if (activeSession.get()) {
    const ok = await confirmDialog({ title: t('start.replaceTitle'), text: t('start.replaceText'), confirm: t('start.replaceConfirm'), danger: true });
    if (!ok) return;
    activeSession.clear();
  }
  unlockAudio();                                    // звук разрешается только после нажатия
  router.go('player', { plan });
}
