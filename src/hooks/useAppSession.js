import { useCallback, useEffect, useRef, useState } from "react"
import { hasSupabaseEnv } from "../lib/supabase"
import { getCurrentSession, onAuthStateChange, signOut } from "../lib/auth"
import {
  createFeature as createFeatureRecord,
  createMap as createMapRecord,
  followUser as followUserRecord,
  getMyAppData,
  getProfile as getProfileRecord,
  publishMap as publishMapRecord,
} from "../lib/mapService"
import {
  featuresSeed,
  followedSeed,
  mapsSeed,
  me,
  sharesSeed,
} from "../data/sampleData"
import { mergeFeatureListWithLocalMedia } from "../lib/featureMediaMerge"
import { claimPublicSavedItemsForCurrentUser } from "../lib/publicSavedItems"
import { syncFeatureLocalMediaToCloud } from "../lib/mediaCloudSync"

const isAnonymousAuthUser = (user) => Boolean(user?.is_anonymous || user?.app_metadata?.provider === "anonymous")

export function useAppSession({
  setMaps, setFeatures, setShares, setFollowed, setViewerProfile,
  setCollaborationInvites,
  setActiveTab, setMapsView, setActiveMapSource, setActiveMapId,
  setSelectedFeatureId, setSelectedFeatureSummaryId,
  setFeatureSheet, setEditorMode, setDraftPoints,
  setMapSheet, setPublishSheet, setSelectedUserId, setSelectedPostRef,
  setSharedMapData, setShareEditorImage,
  showToast, routeAtLoad,
}) {
  const [authReady, setAuthReady] = useState(!hasSupabaseEnv)
  const [authUser, setAuthUser] = useState(null)
  const [cloudLoading, setCloudLoading] = useState(false)
  const [cloudDataReady, setCloudDataReady] = useState(false)
  const [cloudLoadedUserId, setCloudLoadedUserId] = useState(null)
  const cloudLoadedUserIdRef = useRef(null)
  // gameProfile / recentReward state 폐기.

  const cloudMode = hasSupabaseEnv && Boolean(authUser) && !isAnonymousAuthUser(authUser)

  const readLocalImportData = useCallback(() => {
    const readStored = (key) => {
      try {
        const raw = window.localStorage.getItem(key)
        if (!raw) return { exists: false, value: [] }
        return { exists: true, value: JSON.parse(raw) }
      } catch {
        return { exists: false, value: [] }
      }
    }
    const storedMaps = readStored("loca.mobile.maps")
    const storedFeatures = readStored("loca.mobile.features")
    const storedShares = readStored("loca.mobile.shares")
    const storedFollowed = readStored("loca.mobile.followed")
    return {
      maps: storedMaps.value,
      features: storedFeatures.value,
      shares: storedShares.value,
      followed: storedFollowed.value,
      hasAny:
        (storedMaps.exists && storedMaps.value.length > 0) ||
        (storedFeatures.exists && storedFeatures.value.length > 0) ||
        (storedShares.exists && storedShares.value.length > 0) ||
        (storedFollowed.exists && storedFollowed.value.length > 0),
    }
  }, [])

  const loadCloudData = useCallback(async (user) => {
    if (!hasSupabaseEnv || !user) return
    if (cloudLoadedUserIdRef.current !== user.id) setCloudDataReady(false)
    setCloudLoading(true)
    try {
      const [appData, profile] = await Promise.all([
        getMyAppData(),
        getProfileRecord(user.id).catch((error) => {
          console.warn("Failed to load profile; using auth metadata fallback", error)
          return {}
        }),
      ])

      const profileAlias = profile.alias || profile.tagline || profile.ho || ""
      const nextProfile = {
        id: user.id,
        name: profile.nickname || user.user_metadata?.name || user.email?.split("@")[0] || "LOCA 사용자",
        handle: profile.slug ? `@${profile.slug}` : `@${(profile.nickname || user.email?.split("@")[0] || "loca").toLowerCase().replace(/\s+/g, "_")}`,
        emoji: (profile.avatar_url && !profile.avatar_url.startsWith("http") && !profile.avatar_url.startsWith("data:")) ? profile.avatar_url : me.emoji,
        avatarUrl: (profile.avatar_url && (profile.avatar_url.startsWith("http") || profile.avatar_url.startsWith("data:"))) ? profile.avatar_url : null,
        alias: profileAlias,
        tagline: profileAlias,
        ho: profileAlias,
        bio: profile.bio || me.bio,
        link: profile.link || "",
        followers: appData.followerCount || 0,
        following: appData.followed.length,
        verified: false,
        type: "creator",
      }

      const cloudEmpty = appData.maps.length === 0
      const appMaps = appData.maps.filter((mapItem) => !mapItem.isCommunity)
      const appMapIds = new Set(appMaps.map((mapItem) => mapItem.id))
      const appFeatures = appData.features.filter((featureItem) => appMapIds.has(featureItem.mapId))
      const localData = readLocalImportData()
      const hasLocalData = localData.hasAny && localData.maps.length > 0
        && !localData.maps.every((m) => mapsSeed.some((s) => s.id === m.id))

      setMaps(appMaps)
      setFeatures((current) => mergeFeatureListWithLocalMedia(appFeatures, current))
      setShares(appData.shares)
      setFollowed(appData.followed)
      setCollaborationInvites?.(appData.collaborationInvites || [])
      setViewerProfile((current) => {
        const localAlias = current?.alias || current?.tagline || current?.ho || ""
        const alias = nextProfile.alias || localAlias
        return {
          ...nextProfile,
          alias,
          tagline: alias,
          ho: alias,
        }
      })

      if (cloudEmpty && hasLocalData) {
        showToast("로컬 데이터를 발견했어요. 프로필 → 설정에서 '데이터 가져오기'를 눌러주세요.")
      }

      setActiveMapId((current) => {
        if (current && appMaps.some((mapItem) => mapItem.id === current)) return current
        return appMaps[0]?.id ?? null
      })
      if (routeAtLoad?.type === "map" && appMaps.some((mapItem) => mapItem.id === routeAtLoad.mapId)) {
        setActiveTab("maps")
        setMapsView("editor")
        setActiveMapSource("local")
        setActiveMapId(routeAtLoad.mapId)
      }
      cloudLoadedUserIdRef.current = user.id
      setCloudLoadedUserId(user.id)
      setCloudDataReady(true)
      try { window.localStorage?.setItem("loca.mobile.cloudUserId", user.id) } catch { /* noop */ }
    } catch (error) {
      console.error("Failed to load Supabase app data", error)
      showToast("Supabase 데이터를 불러오지 못했어요.")
      cloudLoadedUserIdRef.current = user.id
      setCloudLoadedUserId(user.id)
      setCloudDataReady(true)
    } finally {
      setCloudLoading(false)
    }
  }, [readLocalImportData, routeAtLoad, setCollaborationInvites, setFeatures, setFollowed, setMaps, setShares, setViewerProfile, showToast, setActiveMapId, setActiveMapSource, setActiveTab, setMapsView])

  const resetToLoggedOut = useCallback(() => {
    const keepSharedViewer = routeAtLoad?.type === "shared" || routeAtLoad?.type === "slug"
    setMaps(mapsSeed)
    setFeatures(featuresSeed)
    setShares(sharesSeed)
    setFollowed(followedSeed)
    setCollaborationInvites?.([])
    setViewerProfile(me)
    setCloudDataReady(false)
    cloudLoadedUserIdRef.current = null
    setCloudLoadedUserId(null)
    try { window.localStorage?.removeItem("loca.mobile.cloudUserId") } catch { /* noop */ }
    if (!keepSharedViewer) {
      // 비로그인 상태의 홈은 탐색(공개 지도 구경) — 로그인 강요 없이 시작
      setActiveTab("explore")
      setMapsView("list")
      setActiveMapSource("local")
      setActiveMapId(mapsSeed[0]?.id ?? null)
    }
    setSelectedFeatureId(null)
    setSelectedFeatureSummaryId(null)
    setFeatureSheet(null)
    setEditorMode("browse")
    setDraftPoints([])
    setMapSheet(null)
    setPublishSheet(null)
    setSelectedUserId(null)
    setSelectedPostRef(null)
    if (!keepSharedViewer) setSharedMapData(null)
    setShareEditorImage(null)
  }, [routeAtLoad?.type, setCollaborationInvites, setFeatures, setFollowed, setMaps, setShares, setViewerProfile, setActiveTab, setMapsView, setActiveMapSource, setActiveMapId, setSelectedFeatureId, setSelectedFeatureSummaryId, setFeatureSheet, setEditorMode, setDraftPoints, setMapSheet, setPublishSheet, setSelectedUserId, setSelectedPostRef, setSharedMapData, setShareEditorImage])

  // 초기 세션 확인 + auth state 구독
  useEffect(() => {
    if (!hasSupabaseEnv) return undefined

    let isMounted = true

    getCurrentSession()
      .then((session) => {
        if (!isMounted) return
        const user = session?.user ?? null
        const appUser = isAnonymousAuthUser(user) ? null : user
        setAuthUser(appUser)
        setAuthReady(true)
        if (appUser) {
          claimPublicSavedItemsForCurrentUser().catch((error) => {
            console.warn("Failed to claim public saved items", error)
          })
          loadCloudData(appUser)
        }
      })
      .catch((error) => {
        console.error("Failed to resolve initial auth session", error)
        if (isMounted) setAuthReady(true)
      })

    const { data: subscription } = onAuthStateChange((user) => {
      if (!isMounted) return
      const appUser = isAnonymousAuthUser(user) ? null : user
      setAuthUser(appUser)
      setAuthReady(true)
      if (appUser) {
        claimPublicSavedItemsForCurrentUser().catch((error) => {
          console.warn("Failed to claim public saved items", error)
        })
        loadCloudData(appUser)
      } else {
        resetToLoggedOut()
      }
    })

    return () => {
      isMounted = false
      subscription.subscription.unsubscribe()
    }
  }, [loadCloudData, resetToLoggedOut])

  const handleSignOut = useCallback(async () => {
    try {
      await signOut()
      resetToLoggedOut()
      showToast("로그아웃했어요.")
    } catch (error) {
      console.error("Failed to sign out", error)
      showToast("로그아웃하지 못했어요.")
    }
  }, [resetToLoggedOut, showToast])

  const importLocalDataToCloud = useCallback(async () => {
    if (!cloudMode) return showToast("먼저 로그인해 주세요.")
    const localData = readLocalImportData()
    if (!localData.hasAny) return showToast("이 기기에서 가져올 로컬 데이터가 없어요.")
    if (!window.confirm("이 기기에 저장된 로컬 지도를 현재 계정으로 옮겨올까요?")) return

    try {
      const mapIdMap = new Map()

      for (const localMap of localData.maps) {
        const createdMap = await createMapRecord({
          title: localMap.title,
          description: localMap.description,
          theme: localMap.theme,
          visibility: localMap.visibility || "private",
          tags: localMap.tags || [],
        })
        mapIdMap.set(localMap.id, createdMap)
      }

      for (const localFeature of localData.features) {
        const targetMap = mapIdMap.get(localFeature.mapId)
        if (!targetMap) continue
        const createdFeature = await createFeatureRecord(targetMap.id, {
          ...localFeature,
          mapId: targetMap.id,
        })
        await syncFeatureLocalMediaToCloud({
          ...createdFeature,
          photos: localFeature.photos || [],
          voices: localFeature.voices || [],
        }, { throwOnFailure: true })
      }

      for (const localShare of localData.shares) {
        const targetMap = mapIdMap.get(localShare.mapId)
        if (!targetMap) continue
        await publishMapRecord(targetMap.id, {
          caption: localShare.caption || "",
        })
      }

      for (const userId of localData.followed) {
        try {
          await followUserRecord(userId)
        } catch (error) {
          console.warn("Skipping follow import", userId, error)
        }
      }

      await loadCloudData(authUser)
      showToast("이 기기의 로컬 데이터를 계정으로 가져왔어요.")
    } catch (error) {
      console.error("Failed to import local data", error)
      if (error?.message) {
        showToast(error.message)
        return
      }
      showToast("로컬 데이터를 가져오지 못했어요.")
    }
  }, [authUser, cloudMode, loadCloudData, readLocalImportData, showToast])

  const reloadCloudData = useCallback(async () => {
    if (!authUser) return
    await loadCloudData(authUser)
  }, [authUser, loadCloudData])

  return {
    authReady,
    authUser,
    cloudMode,
    cloudLoading,
    cloudDataReady,
    cloudLoadedUserId,
    readLocalImportData,
    resetToLoggedOut,
    reloadCloudData,
    handleSignOut,
    importLocalDataToCloud,
  }
}
