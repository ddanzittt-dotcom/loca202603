/**
 * mapService.js — facade re-export
 *
 * 기능별 모듈로 분리되었지만, 기존 import 호환을 위해
 * 모든 public API를 이 파일에서 re-export한다.
 *
 * 모듈 구조:
 *   mapService.utils.js   — 에러 처리, normalize, 변환 헬퍼
 *   mapService.read.js    — 조회 (get*, list*, check*, search*)
 *   mapService.write.js   — 생성/수정/삭제 (create*, update*, delete*, add*, follow*)
 *   mapService.publish.js — 발행, 공지, B2B, gamification RPC, 설문
 */

// utils
export { friendlySupabaseError } from "./mapService.utils"

// read
export {
  getMyMaps,
  getMyAppData,
  getMapBundle,
  getCommunityMapBundle,
  getPublishedMapBySlug,
  getPublishedMaps,
  getFeatureMemos,
  getFeatureOperatorNote,
  getProfile,
  getProfileBySlug,
  getFollowingIds,
  getMyCheckins,
  getGameProfile,
  getUserStats,
  getUserBadges,
  searchUsersForInvite,
  checkCollaboratorAccess,
  checkAdminRole,
  searchProfiles,
  listFeatureChangeRequests,
} from "./mapService.read"

// write
export {
  createMap,
  ensureCommunityMap,
  updateMap,
  deleteMap,
  createFeature,
  updateFeature,
  deleteFeature,
  addFeatureMemo,
  saveFeatureOperatorNote,
  createMediaRecord,
  deleteMediaRecord,
  uploadAvatar,
  updateProfile,
  followUser,
  unfollowUser,
  incrementLike,
  getCollaborators,
  addCollaborator,
  removeCollaborator,
  createFeatureChangeRequest,
  resolveFeatureChangeRequest,
  linkMapLineage,
} from "./mapService.write"

// profile placement (프로필 노출 — 발행과 분리된 별도 액션)
export {
  getProfilePlacementState,
  findPlacementForMap,
  addMapToProfile,
  removeMapFromProfile,
  resetLegacyProfileCuration,
  PROFILE_CURATION_RESET_FLAG,
} from "./mapPlacement"

// publish / announcements / B2B / gamification / survey
export {
  publishMap,
  unpublishMap,
  saveMap,
  unsaveMap,
  redeemInvitationCode,
  checkB2BAccess,
  getActiveAnnouncements,
  getAllAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  toggleAnnouncementActive,
  deleteAnnouncement,
  submitEventCheckin,
  recordMapAction,
  submitSurveyReward,
  upsertUserStats,
  updateStreak,
  awardBadge,
  awardSouvenir,
  submitSurveyResponse,
} from "./mapService.publish"
