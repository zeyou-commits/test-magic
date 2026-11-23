/*
 * Copyright 2020 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package com.bledway.app;

import android.content.Intent;
import android.content.IntentSender;
import android.content.pm.ActivityInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;

import com.google.android.play.core.appupdate.AppUpdateInfo;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.appupdate.AppUpdateOptions;
import com.google.android.play.core.install.model.ActivityResult;
import com.google.android.play.core.install.model.AppUpdateType;
import com.google.android.play.core.install.model.UpdateAvailability;

/**
 * Mise à jour obligatoire : avant d'ouvrir le site, on demande à Google Play s'il existe une
 * version plus récente. Si oui, Google affiche son écran plein écran « Mise à jour » (barre de
 * progression, redémarrage automatique). Refuser ferme l'appli. Sans réponse de Play en 2 s
 * (hors ligne, appli installée hors Play Store…), le site s'ouvre normalement.
 */
public class LauncherActivity
        extends com.google.androidbrowserhelper.trusted.LauncherActivity {

    private static final int REQUETE_MAJ = 504;
    private static final long DELAI_MAX_MS = 2000;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private AppUpdateManager updateManager;
    private boolean decide = false;   // le site a été ouvert, ou l'écran de mise à jour lancé

    @Override
    protected boolean shouldLaunchImmediately() {
        return false;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Setting an orientation crashes the app due to the transparent background on Android 8.0
        // Oreo and below. We only set the orientation on Oreo and above. This only affects the
        // splash screen and Chrome will still respect the orientation.
        // See https://github.com/GoogleChromeLabs/bubblewrap/issues/496 for details.
        if (Build.VERSION.SDK_INT > Build.VERSION_CODES.O) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        } else {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        }
        if (isFinishing()) return;
        verifierMiseAJour();
    }

    private void verifierMiseAJour() {
        handler.postDelayed(this::ouvrirSite, DELAI_MAX_MS);
        try {
            updateManager = AppUpdateManagerFactory.create(this);
            updateManager.getAppUpdateInfo()
                    .addOnSuccessListener(this::surInfo)
                    .addOnFailureListener(e -> ouvrirSite());
        } catch (Exception e) {
            ouvrirSite();
        }
    }

    private void surInfo(AppUpdateInfo info) {
        if (decide || isFinishing()) return;
        int dispo = info.updateAvailability();
        boolean aFaire = dispo == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS
                || (dispo == UpdateAvailability.UPDATE_AVAILABLE
                    && info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE));
        if (!aFaire) {
            ouvrirSite();
            return;
        }
        decide = true;
        handler.removeCallbacksAndMessages(null);
        boolean lance;
        try {
            lance = updateManager.startUpdateFlowForResult(info, this,
                    AppUpdateOptions.newBuilder(AppUpdateType.IMMEDIATE).build(), REQUETE_MAJ);
        } catch (IntentSender.SendIntentException e) {
            lance = false;
        }
        if (!lance) {
            decide = false;
            ouvrirSite();
        }
    }

    private void ouvrirSite() {
        if (decide || isFinishing()) return;
        decide = true;
        handler.removeCallbacksAndMessages(null);
        launchTwa();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQUETE_MAJ) return;
        if (resultCode == RESULT_CANCELED) {
            // Mise à jour refusée : l'appli ne s'ouvre pas sans elle.
            finish();
        } else if (resultCode == ActivityResult.RESULT_IN_APP_UPDATE_FAILED) {
            // Échec côté Play (réseau, espace…) : on ne bloque pas le voyageur.
            decide = false;
            ouvrirSite();
        }
        // RESULT_OK : Play installe puis relance l'appli tout seul.
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }

    @Override
    protected Uri getLaunchingUrl() {
        // Get the original launch Url.
        Uri uri = super.getLaunchingUrl();



        return uri;
    }
}
