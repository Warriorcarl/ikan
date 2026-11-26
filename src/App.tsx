/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { BottomDock } from './components/BottomDock';
import {
  BranchModal,
  EventModal,
  SaveModal,
} from './components/EventModal';
import { ManagementDrawer } from './components/ManagementDrawer';
import { NpcBubblesOverlay } from './components/NpcBubblesOverlay';
import { PondInspector } from './components/PondInspector';
import { SettlementBanner } from './components/SettlementBanner';
import { TitleOverlay } from './components/TitleOverlay';
import { ToastStack } from './components/ToastStack';
import { TopHud } from './components/TopHud';
import {
  ActionResult,
  actionBuildOrConvertPond,
  actionBuildOrUpgradeKioskPlot,
  actionBuyFeed,
  actionBuyInvestment,
  actionClaimAchievement,
  actionClaimMission,
  actionClaimStoryChapter,
  actionDeferEvent,
  actionDemolishPond,
  actionDismissResearcher,
  actionFeedAllPonds,
  actionFeedPond,
  actionFireStaff,
  actionFlushWater,
  actionHarvestPond,
  actionHarvestReadyPonds,
  actionHireStaff,
  actionRecruitResearcher,
  actionReopenDeferredEvent,
  actionRepayLoan,
  actionResolveEventChoice,
  actionSellInvestment,
  actionSignPartnership,
  actionSortFish,
  actionStockFish,
  actionSwitchOrUnlockBranch,
  actionTakeLoan,
  actionUnlockResearch,
  actionUpgradeInfra,
  actionUpgradePond,
  actionUpgradeSlotKiosk,
} from './game/actions';
import { soundEngine } from './game/audio';
import {
  applyEventNeglect,
  createInitialGameState,
  stepSimulation,
  syncAchievementsAndStory,
} from './game/simulation';
import {
  deleteSaveSlot,
  listSaveSlotsMeta,
  loadGameFromSlot,
  saveGameToSlot,
} from './game/storage';
import {
  BranchId,
  CameraPresetId,
  DrawerTab,
  GameSpeed,
  GameState,
  InfraKey,
  KioskBusinessType,
  PondType,
  PondUpgradeKey,
  ProjectedNpcBubble,
  SaveSlotMeta,
  SpeciesId,
  ToastMessage,
} from './game/types';
import { WorldController } from './three/WorldController';

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const worldRef = useRef<WorldController | null>(null);

  const [screenMode, setScreenMode] = useState<'title' | 'playing'>('title');
  const [gameState, setGameState] = useState<GameState>(() => createInitialGameState());
  const [speed, setSpeed] = useState<GameSpeed>(1);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<DrawerTab>('none');
  const [hudCollapsed, setHudCollapsed] = useState(false);
  const [muted, setMuted] = useState(false);
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveSlots, setSaveSlots] = useState<SaveSlotMeta[]>(() => listSaveSlotsMeta());
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [showSettlement, setShowSettlement] = useState(false);
  const [npcBubbles, setNpcBubbles] = useState<ProjectedNpcBubble[]>([]);

  // Refs synced for zero-restart 3D loop
  const stateRef = useRef(gameState);
  stateRef.current = gameState;
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const selectedSlotRef = useRef(selectedSlot);
  selectedSlotRef.current = selectedSlot;
  const screenModeRef = useRef(screenMode);
  screenModeRef.current = screenMode;
  const uiSyncTimerRef = useRef(0);

  const pushToast = useCallback(
    (title: string, message: string, tone: ToastMessage['tone'] = 'info') => {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-3), { id, title, message, tone, createdAt: Date.now() }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4200);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleSelectPondFrom3D = useCallback((slotIndex: number) => {
    soundEngine.playClick();
    setActiveTab('none');
    setSelectedSlot(slotIndex);
    worldRef.current?.focusPondSlot(slotIndex);
  }, []);

  const handleTickFrame = useCallback(
    (rawDt: number) => {
      if (screenModeRef.current !== 'playing') return;
      const curState = stateRef.current;

      // While modal is open (!deferred), freeze game time progression but still enforce the 10-minute deadline
      if (curState.activeEvent && !curState.activeEvent.deferred) {
        if (Date.now() >= curState.activeEvent.expiresAtMs) {
          const neglected = applyEventNeglect(curState);
          if (neglected) {
            if (neglected.urgent) soundEngine.playAlert();
            pushToast(
              `Batas Waktu Habis: ${neglected.title}`,
              neglected.summary,
              neglected.urgent ? 'danger' : 'info'
            );
            setGameState({ ...curState });
          }
        }
        return;
      }

      const res = stepSimulation(curState, rawDt, speedRef.current);
      uiSyncTimerRef.current += rawDt;

      if (res.eventNeglected) {
        if (res.eventNeglected.urgent) soundEngine.playAlert();
        pushToast(
          `Batas Waktu Habis: ${res.eventNeglected.title}`,
          res.eventNeglected.summary,
          res.eventNeglected.urgent ? 'danger' : 'info'
        );
      }

      if (res.settledDay) {
        saveGameToSlot('autosave', curState);
        setSaveSlots(listSaveSlotsMeta());
        if (res.safetyNetTriggered) {
          pushToast(
            'Dana Talangan Koperasi',
            'Koperasi tambak menyalurkan dana talangan darurat agar usaha tetap berjalan.',
            'warning'
          );
        }
        if (res.newEventTriggered) {
          soundEngine.playAlert();
        }
      }

      if (res.settledMonth) {
        soundEngine.playCoin();
        setShowSettlement(true);
      }

      if (res.leveledUp) {
        soundEngine.playLevelUp();
        pushToast(
          `Naik Level ${curState.level}!`,
          'Cabang, spesies, dan tingkat upgrade baru kini tersedia.',
          'success'
        );
      }

      if (res.newlyUnlockedPlots > 0) {
        soundEngine.playLevelUp();
        pushToast(
          'Lahan Baru Terbuka!',
          `${res.newlyUnlockedPlots} plot lahan tambahan kini siap dibangun.`,
          'success'
        );
      }

      if (res.newlyUnlockedAch.length > 0) {
        soundEngine.playLevelUp();
        res.newlyUnlockedAch.forEach((title) => {
          pushToast('Pencapaian Terbuka!', `${title} — klaim bonus di tab Pencapaian.`, 'success');
        });
      }

      if (
        res.settledDay ||
        res.leveledUp ||
        res.eventNeglected ||
        uiSyncTimerRef.current >= 0.14
      ) {
        uiSyncTimerRef.current = 0;
        setGameState({ ...curState });
      }
    },
    [pushToast]
  );

  // Mount Three.js World once
  useEffect(() => {
    const mountEl = canvasMountRef.current;
    if (!mountEl) return;

    const controller = new WorldController(mountEl, {
      onSelectPond: handleSelectPondFrom3D,
      onTickFrame: handleTickFrame,
      onUpdateNpcBubbles: (bubbles) => setNpcBubbles(bubbles),
      getLatestState: () => ({
        gameState: stateRef.current,
        selectedSlot: selectedSlotRef.current,
        speed: speedRef.current,
        isTitleScreen: screenModeRef.current === 'title',
      }),
    });
    worldRef.current = controller;

    return () => {
      controller.dispose();
      worldRef.current = null;
    };
  }, [handleSelectPondFrom3D, handleTickFrame]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (screenModeRef.current === 'title') {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          soundEngine.playBuild();
          setGameState(createInitialGameState());
          setScreenMode('playing');
          worldRef.current?.setCameraPreset('overview');
        }
        return;
      }

      if (e.key === 'h' || e.key === 'H') {
        setHudCollapsed((v) => !v);
      } else if (e.key === ' ') {
        e.preventDefault();
        setSpeed((s) => (s === 0 ? 1 : 0));
      } else if (e.key === 'Escape') {
        if (showBranchModal) setShowBranchModal(false);
        else if (showSaveModal) setShowSaveModal(false);
        else if (activeTab !== 'none') setActiveTab('none');
        else if (selectedSlot !== null) setSelectedSlot(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTab, selectedSlot, showBranchModal, showSaveModal]);

  const applyAction = useCallback(
    (res: ActionResult) => {
      if (res.ok) {
        stateRef.current = res.state;
        setGameState(res.state);
        if (res.sound === 'splash') soundEngine.playSplash();
        else if (res.sound === 'coin') soundEngine.playCoin();
        else if (res.sound === 'build') soundEngine.playBuild();
        else if (res.sound === 'levelup') soundEngine.playLevelUp();
        else if (res.sound === 'alert') soundEngine.playAlert();
        else soundEngine.playClick();
      } else {
        soundEngine.playAlert();
      }
      pushToast(res.title, res.message, res.tone);
    },
    [pushToast]
  );

  const handleStartNew = () => {
    soundEngine.playBuild();
    const fresh = createInitialGameState();
    stateRef.current = fresh;
    setGameState(fresh);
    setSelectedSlot(0);
    setActiveTab('none');
    setScreenMode('playing');
    worldRef.current?.setCameraPreset('overview');
  };

  const handleLoadSlot = (slotId: string) => {
    const loaded = loadGameFromSlot(slotId);
    if (!loaded) {
      pushToast('Gagal Memuat', 'Data simpanan tidak ditemukan atau rusak.', 'danger');
      return;
    }
    soundEngine.playLevelUp();
    stateRef.current = loaded;
    setGameState(loaded);
    setSelectedSlot(null);
    setActiveTab('none');
    setScreenMode('playing');
    worldRef.current?.setCameraPreset('overview');
    pushToast('Permainan Dimuat', `Melanjutkan Hari #${loaded.day} (${loaded.farmName}).`, 'success');
  };

  const handleSaveSlot = (slotId: string) => {
    const ok = saveGameToSlot(slotId, stateRef.current);
    setSaveSlots(listSaveSlotsMeta());
    if (ok) {
      soundEngine.playCoin();
      pushToast('Tersimpan', 'Progres tambak berhasil disimpan.', 'success');
    } else {
      pushToast('Gagal Menyimpan', 'Penyimpanan browser penuh.', 'danger');
    }
  };

  const handleDeleteSlot = (slotId: string) => {
    deleteSaveSlot(slotId);
    setSaveSlots(listSaveSlotsMeta());
    pushToast('Slot Dihapus', 'Data simpanan telah dihapus.', 'info');
  };

  const claimableAchCount = Object.values(gameState.achievements).filter(
    (a) => a.unlocked && !a.claimed
  ).length;
  const storySync = syncAchievementsAndStory(structuredClone(gameState));

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#09151c]">
      {/* Dedicated Full-Viewport 3D Canvas Container */}
      <div ref={canvasMountRef} className="fixed inset-0 w-full h-full" />

      {/* 3D-Projected NPC Speech Bubbles */}
      <NpcBubblesOverlay
        bubbles={npcBubbles}
        hidden={screenMode !== 'playing' || hudCollapsed || activeTab !== 'none'}
      />

      {/* Title Screen */}
      {screenMode === 'title' && (
        <TitleOverlay
          saveSlots={saveSlots}
          onStartNew={handleStartNew}
          onLoadSlot={handleLoadSlot}
          onDeleteSlot={handleDeleteSlot}
        />
      )}

      {/* Playing Mode HUD */}
      {screenMode === 'playing' && (
        <>
          <TopHud
            state={gameState}
            speed={speed}
            muted={muted}
            onSetSpeed={(s) => {
              soundEngine.playClick();
              setSpeed(s);
            }}
            onToggleMute={() => {
              const next = !muted;
              soundEngine.setMuted(next);
              setMuted(next);
            }}
            onOpenSaveModal={() => {
              setSaveSlots(listSaveSlotsMeta());
              setShowSaveModal(true);
            }}
            onOpenBranchModal={() => setShowBranchModal(true)}
            onFeedAllPonds={() => applyAction(actionFeedAllPonds(stateRef.current))}
            onHarvestReadyPonds={() => applyAction(actionHarvestReadyPonds(stateRef.current))}
            onReopenEvent={() => {
              soundEngine.playClick();
              const next = actionReopenDeferredEvent(stateRef.current);
              stateRef.current = next;
              setGameState(next);
            }}
          />

          {showSettlement && gameState.lastSettlementReport && (
            <SettlementBanner
              report={gameState.lastSettlementReport}
              onDismiss={() => setShowSettlement(false)}
              onOpenReports={() => {
                setSelectedSlot(null);
                setActiveTab('reports');
              }}
            />
          )}

          {selectedSlot !== null && activeTab === 'none' && (
            <PondInspector
              state={gameState}
              selectedSlot={selectedSlot}
              onSelectSlot={(idx) => {
                setSelectedSlot(idx);
                worldRef.current?.focusPondSlot(idx);
              }}
              onClose={() => setSelectedSlot(null)}
              onBuildPond={(pondId, pt: PondType) =>
                applyAction(actionBuildOrConvertPond(stateRef.current, pondId, pt))
              }
              onDemolishPond={(pondId) =>
                applyAction(actionDemolishPond(stateRef.current, pondId))
              }
              onStockFish={(pondId, sp: SpeciesId, count: number) =>
                applyAction(actionStockFish(stateRef.current, pondId, sp, count))
              }
              onFeedPond={(pondId) =>
                applyAction(actionFeedPond(stateRef.current, pondId))
              }
              onFlushWater={(pondId) =>
                applyAction(actionFlushWater(stateRef.current, pondId))
              }
              onSortFish={(pondId) =>
                applyAction(actionSortFish(stateRef.current, pondId))
              }
              onHarvestPond={(pondId) =>
                applyAction(actionHarvestPond(stateRef.current, pondId))
              }
              onUpgradePond={(pondId, key: PondUpgradeKey) =>
                applyAction(actionUpgradePond(stateRef.current, pondId, key))
              }
              onUpgradeSlotKiosk={(pondId) =>
                applyAction(actionUpgradeSlotKiosk(stateRef.current, pondId))
              }
            />
          )}

          <ManagementDrawer
            tab={activeTab}
            state={gameState}
            onSelectTab={(nextTab) => {
              soundEngine.playClick();
              setActiveTab(nextTab);
            }}
            onClose={() => setActiveTab('none')}
            onBuyFeed={(kg) => applyAction(actionBuyFeed(stateRef.current, kg))}
            onUpgradeInfra={(key: InfraKey) =>
              applyAction(actionUpgradeInfra(stateRef.current, key))
            }
            onBuildOrUpgradeKiosk={(kioskId: string, bt: KioskBusinessType) =>
              applyAction(actionBuildOrUpgradeKioskPlot(stateRef.current, kioskId, bt))
            }
            onHireStaff={(staffId) => applyAction(actionHireStaff(stateRef.current, staffId))}
            onFireStaff={(staffId) => applyAction(actionFireStaff(stateRef.current, staffId))}
            onRecruitResearcher={(resId) =>
              applyAction(actionRecruitResearcher(stateRef.current, resId))
            }
            onDismissResearcher={(resId) =>
              applyAction(actionDismissResearcher(stateRef.current, resId))
            }
            onUnlockResearch={(id) =>
              applyAction(actionUnlockResearch(stateRef.current, id))
            }
            onClaimAchievement={(id) =>
              applyAction(actionClaimAchievement(stateRef.current, id))
            }
            onClaimMission={(id) =>
              applyAction(actionClaimMission(stateRef.current, id))
            }
            onClaimStory={() => applyAction(actionClaimStoryChapter(stateRef.current))}
            onTakeLoan={(pkg) => applyAction(actionTakeLoan(stateRef.current, pkg))}
            onRepayLoan={(loanId) => applyAction(actionRepayLoan(stateRef.current, loanId))}
            onBuyInvestment={(assetId, units) =>
              applyAction(actionBuyInvestment(stateRef.current, assetId, units))
            }
            onSellInvestment={(assetId, units) =>
              applyAction(actionSellInvestment(stateRef.current, assetId, units))
            }
            onSignPartnership={(pid) =>
              applyAction(actionSignPartnership(stateRef.current, pid))
            }
          />

          <BottomDock
            collapsed={hudCollapsed}
            activeTab={activeTab}
            hasPondSelected={selectedSlot !== null}
            claimableAchCount={claimableAchCount}
            storyReady={storySync.storyChapterCompleted}
            onToggleCollapse={() => setHudCollapsed((v) => !v)}
            onSelectCamera={(preset: CameraPresetId) => {
              soundEngine.playClick();
              worldRef.current?.setCameraPreset(preset);
            }}
            onSelectTab={(tab) => {
              soundEngine.playClick();
              setActiveTab(tab);
              if (tab !== 'none') setSelectedSlot(null);
            }}
            onTogglePondQuickList={() => {
              soundEngine.playClick();
              setActiveTab('none');
              setSelectedSlot((prev) => {
                const next = prev === null ? 0 : null;
                if (next !== null) worldRef.current?.focusPondSlot(next);
                return next;
              });
            }}
          />

          {gameState.activeEvent && !gameState.activeEvent.deferred && (
            <EventModal
              event={gameState.activeEvent}
              cash={gameState.cash}
              onSelectChoice={(choiceId) =>
                applyAction(actionResolveEventChoice(stateRef.current, choiceId))
              }
              onDefer={() => applyAction(actionDeferEvent(stateRef.current))}
            />
          )}

          {showBranchModal && (
            <BranchModal
              state={gameState}
              onClose={() => setShowBranchModal(false)}
              onSelectOrUnlock={(bid: BranchId) => {
                setSelectedSlot(0);
                applyAction(actionSwitchOrUnlockBranch(stateRef.current, bid));
              }}
            />
          )}

          {showSaveModal && (
            <SaveModal
              slots={saveSlots}
              onClose={() => setShowSaveModal(false)}
              onSaveSlot={handleSaveSlot}
              onLoadSlot={handleLoadSlot}
              onDeleteSlot={handleDeleteSlot}
              onReturnTitle={() => {
                setShowSaveModal(false);
                setScreenMode('title');
              }}
            />
          )}
        </>
      )}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
