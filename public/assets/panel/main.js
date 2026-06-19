import * as format from './core/format.js';
import { createApi } from './core/api.js';
import { cikisYap, kullaniciGecerliMi, loginSayfasinaGit } from './core/auth.js';
import { bindDispatcher } from './core/dispatcher.js';
import { loadPanelPartials, partialHatasiGoster, toast, val } from './core/dom.js';
import { createRouter } from './core/router.js';
import { RENKLER, state } from './core/state.js';
import { createBulkEditFeature } from './features/bulk-edit.js';
import { createChatFeature } from './features/chat.js';
import { createExcelFeature } from './features/excel.js';
import { createLayoutFeature } from './features/layout.js';
import { createMapFeature } from './features/map.js';
import { createNotesFeature } from './features/notes.js';
import { createNotificationsFeature } from './features/notifications.js';
import { createPrivateChatFeature } from './features/private-chat.js';
import { createProfileFeature } from './features/profile.js';
import { createProvinceFeature } from './features/provinces.js';
import { createTasksFeature } from './features/tasks.js';
import { createUsersFeature } from './features/users.js';

async function bootstrap() {
    if (!kullaniciGecerliMi(state.kullanici)) {
        loginSayfasinaGit();
        return;
    }

    try {
        await loadPanelPartials();
    } catch (error) {
        partialHatasiGoster(error);
        return;
    }

    const actions = {};
    const pageLoaders = {};
    const ctx = {
        ...format,
        state,
        actions,
        pageLoaders,
        RENKLER,
        toast,
        val,
        apicagir: createApi(loginSayfasinaGit),
        loginSayfasinaGit
    };

    const features = [
        createLayoutFeature(ctx),
        createProvinceFeature(ctx),
        createMapFeature(ctx),
        createUsersFeature(ctx),
        createProfileFeature(ctx),
        createTasksFeature(ctx),
        createChatFeature(ctx),
        createExcelFeature(ctx),
        createNotificationsFeature(ctx),
        createPrivateChatFeature(ctx),
        createNotesFeature(ctx),
        createBulkEditFeature(ctx)
    ];

    for (const feature of features) {
        Object.assign(actions, feature.actions || {});
        Object.assign(pageLoaders, feature.pageLoaders || {});
    }

    const router = createRouter(pageLoaders);
    Object.assign(actions, router.actions, { cikisYap });

    bindDispatcher(actions);

    for (const feature of features) {
        feature.init?.();
    }

    window.addEventListener('popstate', () => {
        router.sayfaAktifEt(router.panelSayfasiAl());
    });

    router.sayfaAktifEt(router.panelSayfasiAl());
}

bootstrap();
