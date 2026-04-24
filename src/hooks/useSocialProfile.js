import { useCallback } from "react"
import { logEvent } from "../lib/analytics"
import {
  followUser as followUserRecord,
  unfollowUser as unfollowUserRecord,
  updateProfile as updateProfileRecord,
  incrementLike as incrementLikeRecord,
  friendlySupabaseError,
} from "../lib/mapService"
import { createId } from "../lib/appUtils"
import { createFeature as createFeatureRecord } from "../lib/mapService"
import { toEditableFeature } from "./useFeatureEditing"

export function useSocialProfile({
  cloudMode, authUser,
  followed, setFollowed,
  likedPosts, setLikedPosts,
  setShares, setCommunityPosts,
  setViewerProfile,
  setFeatures, setActiveTab, setMapsView, setActiveMapId, setActiveMapSource,
  setSelectedFeatureId, setFeatureSheet, setEditorMode,
  pendingSharePlace, setPendingSharePlace,
  touchMap, showToast,
}) {
  const handleUpdateProfile = useCallback(async ({ name, bio, emoji, avatarUrl, handle, link }) => {
    setViewerProfile((prev) => ({
      ...prev,
      name: name ?? prev.name,
      bio: bio ?? prev.bio,
      emoji: emoji ?? prev.emoji,
      avatarUrl: avatarUrl !== undefined ? avatarUrl : prev.avatarUrl,
      handle: handle != null ? (handle.startsWith("@") ? handle : `@${handle}`) : prev.handle,
      link: link !== undefined ? link : prev.link,
    }))

    if (cloudMode && authUser) {
      try {
        const updates = {}
        if (name != null) updates.nickname = name
        if (bio != null) updates.bio = bio
        if (avatarUrl != null) updates.avatar_url = avatarUrl
        else if (emoji != null) updates.avatar_url = emoji
        if (handle != null) updates.slug = handle.replace(/^@/, "").toLowerCase().replace(/\s+/g, "_")
        if (link !== undefined) updates.link = link
        await updateProfileRecord(authUser.id, updates)
      } catch (error) {
        showToast(friendlySupabaseError(error))
      }
    }
  }, [authUser, cloudMode, setViewerProfile, showToast])

  const toggleFollow = async (userId) => {
    const isFollowing = followed.includes(userId)
    try {
      if (cloudMode) {
        if (isFollowing) await unfollowUserRecord(userId)
        else await followUserRecord(userId)
      }
      logEvent("follow_toggle", { meta: { target_user_id: userId, action: isFollowing ? "unfollow" : "follow" } })
      setFollowed((current) => (current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]))
    } catch (error) {
      console.error("Failed to toggle follow", error)
      showToast("팔로우 상태를 바꾸지 못했어요.")
    }
  }

  const likePost = async (source, postId, mapId) => {
    const likeKey = `${source}:${postId}`
    if (likedPosts.includes(likeKey)) {
      showToast("이미 좋아요를 눌렀어요.")
      return
    }
    setLikedPosts((current) => [...current, likeKey])
    if (source === "own") {
      setShares((current) => current.map((share) => (share.id === postId ? { ...share, likes: share.likes + 1 } : share)))
    } else {
      setCommunityPosts((current) => current.map((post) => (post.id === postId ? { ...post, likes: post.likes + 1 } : post)))
    }
    // DB 저장 (클라우드 모드)
    if (cloudMode && mapId) {
      try {
        await incrementLikeRecord(mapId)
        logEvent("map_like", { map_id: mapId })
      } catch {
        // DB 실패해도 로컬은 이미 반영 — 무시
      }
    }
  }

  const saveSharePlaceToMap = useCallback(async (targetMapId) => {
    if (!pendingSharePlace || !targetMapId) return
    const place = pendingSharePlace
    if (place.lat != null && place.lng != null) {
      const nextFeature = {
        id: createId("feat"),
        mapId: targetMapId,
        type: "pin",
        title: place.title || "공유 장소",
        emoji: "\uD83D\uDCCD",
        lat: place.lat,
        lng: place.lng,
        tags: [],
        note: place.source !== "unknown" ? `${place.source} 에서 공유됨` : "",
        highlight: false,
        updatedAt: new Date().toISOString(),
      }
      if (cloudMode) {
        try {
          const created = await createFeatureRecord(targetMapId, nextFeature)
          setFeatures((current) => [created, ...current])
        } catch (error) {
          console.error("Failed to create shared place pin", error)
          showToast("장소를 저장하지 못했어요.")
          return
        }
      } else {
        setFeatures((current) => [nextFeature, ...current])
      }
      touchMap(targetMapId)
      setPendingSharePlace(null)
      setActiveTab("maps")
      setMapsView("editor")
      setActiveMapId(targetMapId)
      setActiveMapSource("local")
      setSelectedFeatureId(nextFeature.id)
      setFeatureSheet(toEditableFeature(nextFeature))
      setEditorMode("browse")
      showToast("장소가 저장되었어요.")
    } else {
      setPendingSharePlace(null)
      setActiveTab("maps")
      setMapsView("editor")
      setActiveMapId(targetMapId)
      setActiveMapSource("local")
      setEditorMode("pin")
      showToast("지도를 탭해서 위치를 지정하세요")
    }
  }, [cloudMode, pendingSharePlace, setFeatures, showToast, touchMap, setPendingSharePlace, setActiveTab, setMapsView, setActiveMapId, setActiveMapSource, setSelectedFeatureId, setFeatureSheet, setEditorMode])

  return {
    handleUpdateProfile,
    toggleFollow,
    likePost,
    saveSharePlaceToMap,
  }
}
