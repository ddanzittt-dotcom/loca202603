import { lazy, Suspense } from "react"
import { FeatureDetailSheet } from "./sheets/FeatureDetailSheet"
import { MapFormSheet } from "./sheets/MapFormSheet"
import { PublishSheet } from "./sheets/PublishSheet"
import { UserProfileSheet } from "./sheets/UserProfileSheet"
import { PostDetailSheet } from "./sheets/PostDetailSheet"
import { SharePlaceSheet } from "./sheets/SharePlaceSheet"

const MapShareEditor = lazy(() => import("../screens/MapShareEditor").then((m) => ({ default: m.MapShareEditor })))
const ImportMapSheet = lazy(() => import("./sheets/ImportMapSheet").then((m) => ({ default: m.ImportMapSheet })))

function SheetFallback() {
  return null
}

export function AppSheets({
  // MapFormSheet
  mapSheet, setMapSheet, saveMapSheet, deleteMapAction,
  // FeatureDetailSheet
  featureSheet, setFeatureSheet, activeMapSource, featureEmojiChoices,
  setSelectedFeatureId, saveFeatureSheet, deleteFeature, startRelocatePin,
  photoInputRef, isRecording, recordingSeconds,
  handlePhotoSelected, handleDeletePhoto, startRecording, stopRecording, handleDeleteVoice,
  memoText, setMemoText, addMemo,
  // PublishSheet
  publishSheet, setPublishSheet, unpublishedMaps, features, publishMap,
  // UserProfileSheet
  selectedUser, selectedUserPosts, followed, setSelectedUserId, toggleFollow, setSelectedPostRef,
  // PostDetailSheet
  selectedPost, likePost, openMapEditor, unpublish,
  // MapShareEditor
  shareEditorImage, setShareEditorImage, activeMap, activeFeatures, shareUrl, showToast,
  // SharePlaceSheet
  pendingSharePlace, setPendingSharePlace, maps, saveSharePlaceToMap,
  // ImportMapSheet
  importSheetOpen, setImportSheetOpen, handleImportMap,
}) {
  return (
    <>
      <MapFormSheet
        mapSheet={mapSheet}
        setMapSheet={setMapSheet}
        onSave={saveMapSheet}
        onDelete={deleteMapAction}
        onClose={() => setMapSheet(null)}
      />

      <FeatureDetailSheet
        featureSheet={featureSheet}
        setFeatureSheet={setFeatureSheet}
        activeMapSource={activeMapSource}
        featureEmojiChoices={featureEmojiChoices}
        onClose={() => {
          setFeatureSheet(null)
          setSelectedFeatureId(null)
        }}
        onSave={saveFeatureSheet}
        onDelete={deleteFeature}
        onRelocatePin={activeMapSource === "local" ? startRelocatePin : undefined}
        photoInputRef={photoInputRef}
        isRecording={isRecording}
        recordingSeconds={recordingSeconds}
        onPhotoSelected={handlePhotoSelected}
        onDeletePhoto={handleDeletePhoto}
        onStartRecording={startRecording}
        onStopRecording={stopRecording}
        onDeleteVoice={handleDeleteVoice}
        memoText={memoText}
        onMemoTextChange={setMemoText}
        onAddMemo={addMemo}
      />

      <PublishSheet
        publishSheet={publishSheet}
        setPublishSheet={setPublishSheet}
        unpublishedMaps={unpublishedMaps}
        features={features}
        onPublish={() => publishMap()}
        onClose={() => setPublishSheet(null)}
      />

      <UserProfileSheet
        user={selectedUser}
        userPosts={selectedUserPosts}
        isFollowing={selectedUser ? followed.includes(selectedUser.id) : false}
        onClose={() => setSelectedUserId(null)}
        onToggleFollow={toggleFollow}
        onSelectPost={setSelectedPostRef}
      />

      <PostDetailSheet
        post={selectedPost}
        onClose={() => setSelectedPostRef(null)}
        onLike={likePost}
        onOpenMap={(mapId) => { setSelectedPostRef(null); openMapEditor(mapId) }}
        onUnpublish={unpublish}
      />

      {shareEditorImage ? (
        <Suspense fallback={<SheetFallback />}>
          <MapShareEditor
            mapImage={shareEditorImage}
            mapTitle={activeMap?.title || "LOCA"}
            mapTheme={activeMap?.theme}
            mapFeatures={activeFeatures}
            shareUrl={shareUrl}
            onClose={() => setShareEditorImage(null)}
            showToast={showToast}
          />
        </Suspense>
      ) : null}

      <SharePlaceSheet
        pendingSharePlace={pendingSharePlace}
        maps={maps}
        features={features}
        onSaveToMap={saveSharePlaceToMap}
        onClose={() => setPendingSharePlace(null)}
      />

      {importSheetOpen ? (
        <Suspense fallback={<SheetFallback />}>
          <ImportMapSheet
            open={importSheetOpen}
            onClose={() => setImportSheetOpen(false)}
            onImport={handleImportMap}
            showToast={showToast}
          />
        </Suspense>
      ) : null}
    </>
  )
}
