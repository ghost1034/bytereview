'use client'

/**
 * Shared attachment CRUD for task and comment scopes.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { tasklyticToast } from '../ui/tasklyticToast'
import { emitActivity } from '../../lib/activity'
import {
  getCloudDriveAdapter,
  type CloudDriveProvider,
  type CloudDriveFile,
} from '../../lib/cloudDrive'
import { getFileStorageAdapter } from '../../lib/fileStorage'
import { newId } from '../../lib/ids'
import { now } from '../../lib/time'
import { useAttachmentsStore, useProjectsStore, useTasksStore } from '../../stores/entities'
import { useAuthStore } from '../../stores/auth'
import type { Attachment, ID, Project, Task } from '../../types'
import { downloadNamedFile, labelFromUrl } from './attachmentUtils'
import { rehydrateWorkspaceStores } from '../../stores/hydrate'

export type AttachmentScope = {
  kind: 'task' | 'comment' | 'project'
  scopeId: ID
  workspaceId?: ID
  /** Present for task/comment scopes; omitted for project scope. */
  taskId?: ID
  attachmentIds: ID[]
  onAttachmentIdsChange: (ids: ID[]) => Promise<void> | void
}

/** Hook encapsulating upload, link, cloud-drive, rename, and delete flows. */
export function useAttachmentScope(scope: AttachmentScope) {
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const storage = useMemo(() => getFileStorageAdapter(), [])
  const cloudDrive = useMemo(() => getCloudDriveAdapter(), [])
  const addAttachment = useAttachmentsStore((s) => s.add)
  const updateAttachment = useAttachmentsStore((s) => s.update)
  const removeAttachment = useAttachmentsStore((s) => s.remove)
  const attachments = useAttachmentsStore((s) =>
    s.list().filter((a) => scope.attachmentIds.includes(a.id)),
  )
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [driveProvider, setDriveProvider] = useState<CloudDriveProvider | null>(null)
  const [driveMessage, setDriveMessage] = useState<string | undefined>()
  const [driveFiles, setDriveFiles] = useState<CloudDriveFile[]>([])
  const [driveLoading, setDriveLoading] = useState(false)
  const [cloudProviders, setCloudProviders] = useState<CloudDriveProvider[]>([])

  useEffect(() => {
    let active = true
    if (!scope.workspaceId) {
      setCloudProviders([])
      return
    }
    void cloudDrive.availableProviders(scope.workspaceId)
      .then((providers) => { if (active) setCloudProviders(providers) })
      .catch(() => { if (active) setCloudProviders([]) })
    return () => { active = false }
  }, [cloudDrive, scope.workspaceId])

  const attachRecord = useCallback(
    async (att: Attachment) => {
      await addAttachment(att)
      await scope.onAttachmentIdsChange([...scope.attachmentIds, att.id])
      if (currentUserId && scope.taskId) {
        emitActivity({
          taskId: scope.taskId,
          actorId: currentUserId,
          type: 'attachment_added',
          details: { attachmentId: att.id, name: att.name },
        })
      }
    },
    [addAttachment, currentUserId, scope],
  )

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (!files.length || !currentUserId) return
      setUploadError(null)
      for (const file of files) {
        try {
          const uploaded = await storage.upload({
            file,
            ownerId: currentUserId,
            scope: scope.kind,
            scopeId: scope.scopeId,
            workspaceId: scope.workspaceId,
          })
          await attachRecord({
            id: newId(),
            name: uploaded.name,
            size: uploaded.size,
            mime: uploaded.mime,
            dataUrl: uploaded.dataUrl,
            storageRef: uploaded.ref,
            storage: uploaded.storage,
            uploadedBy: currentUserId,
            taskId: scope.taskId,
            commentId: scope.kind === 'comment' ? scope.scopeId : undefined,
            projectId: scope.kind === 'project' ? scope.scopeId : undefined,
            createdAt: now(),
          })
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Upload failed'
          setUploadError(message)
          tasklyticToast('Upload failed', { description: message, status: 'error' })
        }
      }
    },
    [attachRecord, currentUserId, scope, storage],
  )

  const addLink = useCallback(
    async (url: string, label?: string) => {
      if (!currentUserId || !url.trim()) return
      const trimmed = url.trim()
      await attachRecord({
        id: newId(),
        name: label?.trim() || labelFromUrl(trimmed),
        size: 0,
        mime: 'link/url',
        dataUrl: trimmed,
        storage: 'local',
        uploadedBy: currentUserId,
        taskId: scope.taskId,
        commentId: scope.kind === 'comment' ? scope.scopeId : undefined,
        projectId: scope.kind === 'project' ? scope.scopeId : undefined,
        createdAt: now(),
      })
    },
    [attachRecord, currentUserId, scope],
  )

  const connectCloudDrive = useCallback(
    async (provider: CloudDriveProvider) => {
      if (!scope.workspaceId || scope.kind === 'comment') return
      setDriveProvider(provider)
      setDriveMessage(undefined)
      setDriveLoading(true)
      try {
        setDriveFiles(await cloudDrive.listFiles(provider, scope.workspaceId))
      } catch (error) {
        setDriveFiles([])
        setDriveMessage(error instanceof Error ? error.message : 'Google Drive is unavailable.')
      } finally {
        setDriveLoading(false)
      }
    },
    [cloudDrive, scope],
  )

  const importDriveFiles = useCallback(async (fileIds: string[]) => {
    if (!driveProvider || !scope.workspaceId || scope.kind === 'comment') return
    setDriveLoading(true)
    try {
      const result = await cloudDrive.importFiles(driveProvider, {
        workspaceId: scope.workspaceId,
        scope: scope.kind,
        scopeId: scope.scopeId,
        fileIds,
      })
      await rehydrateWorkspaceStores(scope.workspaceId)
      setDriveMessage(result.failures.length ? `${result.imported.length} imported; ${result.failures.length} could not be imported.` : undefined)
      if (result.status === 'succeeded') setDriveProvider(null)
    } catch (error) {
      setDriveMessage(error instanceof Error ? error.message : 'Drive import failed without changing local files.')
    } finally {
      setDriveLoading(false)
    }
  }, [cloudDrive, driveProvider, scope])

  const removeOne = useCallback(
    async (attachment: Attachment) => {
      if (attachment.storageRef) await storage.remove(attachment.storageRef)
      await removeAttachment(attachment.id)
      await scope.onAttachmentIdsChange(scope.attachmentIds.filter((id) => id !== attachment.id))
    },
    [removeAttachment, scope, storage],
  )

  const renameOne = useCallback(
    async (attachment: Attachment) => {
      const next = window.prompt('Rename attachment', attachment.name)
      if (!next?.trim() || next.trim() === attachment.name) return
      await updateAttachment(attachment.id, { name: next.trim() })
    },
    [updateAttachment],
  )

  const downloadOne = useCallback(
    async (attachment: Attachment) => {
      try {
        const url = await storage.getUrl(attachment)
        downloadNamedFile(url, attachment.name)
      } catch (err) {
        tasklyticToast('Download failed', {
          description: err instanceof Error ? err.message : 'Could not download file',
          status: 'error',
        })
      }
    },
    [storage],
  )

  const previewAttachment = attachments.find((a) => a.id === previewId) ?? null

  useEffect(() => {
    let cancelled = false
    if (!previewAttachment) {
      setPreviewUrl(null)
      return
    }
    if (previewAttachment.dataUrl) {
      setPreviewUrl(previewAttachment.dataUrl)
      return
    }
    void storage.getUrl(previewAttachment).then((url) => {
      if (!cancelled) setPreviewUrl(url)
    }).catch(() => {
      if (!cancelled) setPreviewUrl(null)
    })
    return () => { cancelled = true }
  }, [previewAttachment, storage])

  return {
    attachments,
    uploadError,
    uploadFiles,
    addLink,
    connectCloudDrive,
    removeOne,
    renameOne,
    downloadOne,
    previewId,
    setPreviewId,
    previewAttachment,
    previewUrl,
    driveProvider,
    setDriveProvider,
    driveMessage,
    driveFiles,
    driveLoading,
    importDriveFiles,
    maxMb: storage.capabilities.maxFileSize / (1024 * 1024),
    cloudProviders,
    cloudLabel: cloudDrive.label.bind(cloudDrive),
  }
}

/** Task-scoped attachment ids helper. */
export function useTaskAttachmentScope(task: Task) {
  const updateTaskStore = useTasksStore((s) => s.update)
  const onAttachmentIdsChange = useCallback(
    async (ids: ID[]) => {
      await updateTaskStore(task.id, { attachmentIds: ids, modifiedAt: now() })
    },
    [task.id, updateTaskStore],
  )
  const scope = useAttachmentScope({
    kind: 'task',
    scopeId: task.id,
    taskId: task.id,
    workspaceId: task.workspaceId,
    attachmentIds: task.attachmentIds,
    onAttachmentIdsChange,
  })
  return {
    ...scope,
    coverAttachmentId: task.coverAttachmentId,
    setCoverAttachment: async (attachment: Attachment) => {
      await updateTaskStore(task.id, {
        coverAttachmentId: task.coverAttachmentId === attachment.id ? undefined : attachment.id,
        modifiedAt: now(),
      })
    },
    removeOne: async (attachment: Attachment) => {
      await scope.removeOne(attachment)
      if (task.coverAttachmentId === attachment.id) {
        await updateTaskStore(task.id, { coverAttachmentId: undefined, modifiedAt: now() })
      }
    },
  }
}

/** Project-scoped attachment ids helper — powers the Documents section. */
export function useProjectAttachmentScope(project: Project) {
  const updateProjectStore = useProjectsStore((s) => s.update)
  const attachmentIds = useMemo(() => project.attachmentIds ?? [], [project.attachmentIds])
  const onAttachmentIdsChange = useCallback(
    async (ids: ID[]) => {
      await updateProjectStore(project.id, { attachmentIds: ids, modifiedAt: now() })
    },
    [project.id, updateProjectStore],
  )
  return useAttachmentScope({
    kind: 'project',
    scopeId: project.id,
    workspaceId: project.workspaceId,
    attachmentIds,
    onAttachmentIdsChange,
  })
}
