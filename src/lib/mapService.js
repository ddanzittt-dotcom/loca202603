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
  getPublishedMapBySlug,
  getPublishedMaps,
  getFeatureMemos,
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
} from "./mapService.read"

// write
export {
  createMap,
  updateMap,
  deleteMap,
  createFeature,
  updateFeature,
  deleteFeature,
  addFeatureMemo,
  createMediaRecord,
  deleteMediaRecord,
  updateProfile,
  followUser,
  unfollowUser,
  getCollaborators,
  addCollaborator,
  removeCollaborator,
} from "./mapService.write"

// publish / announcements / B2B / gamification / survey
export {
  publishMap,
  unpublishMap,
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
