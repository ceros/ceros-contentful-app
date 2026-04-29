import { EditorAppSDK } from '@contentful/app-sdk'
import { Note } from '@contentful/f36-components'
import { useSDK } from '@contentful/react-apps-toolkit'
import { css, cx, keyframes } from 'emotion'
import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export interface SelectedExperience {
    name: string
    url: string
    embedCode: string
}

interface FolderNode {
    resourceId: string
    name: string
}

interface ExperienceNode {
    resourceId: string
    name: string
    thumbnailUrl?: string
}

// ── Icons ────────────────────────────────────────────────────────────────────

const CloseIcon = () => (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
    </svg>
)

const FolderFilledIcon = () => (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
        <path d="M2 5a1 1 0 0 1 1-1h3.5l1.5 1.5h5a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5Z" />
    </svg>
)

const ChevronRightIcon = () => (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="m6 3 5 5-5 5" />
    </svg>
)

const BackIcon = () => (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="m10 3-5 5 5 5" />
    </svg>
)

// ── Animations ────────────────────────────────────────────────────────────────

const shimmerAnim = keyframes`
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
`

const spinAnim = keyframes`
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
`

// ── CSS classes (handles :hover correctly via CSS, not React state) ────────────

const folderRowClass = css`
    display: flex;
    align-items: center;
    gap: 12px;
    border: 1px solid #DCDFE1;
    background: #fff;
    border-radius: 8px;
    padding: 12px 14px;
    cursor: pointer;
    text-align: left;
    font: inherit;
    width: 100%;
    color: #000;
    &:hover {
        border-color: #979A9B;
        background: #F5F6F7;
    }
`

const cardClass = css`
    position: relative;
    border: 1px solid #DCDFE1;
    background: #fff;
    border-radius: 8px;
    padding: 0;
    cursor: pointer;
    text-align: left;
    font: inherit;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    width: 100%;
    &:hover {
        border-color: #979A9B;
        box-shadow: 0px 2px 16px 0px rgba(0, 0, 0, 0.05);
    }
    &:disabled {
        cursor: wait;
        opacity: 0.65;
    }
`

const crumbBtnClass = css`
    border: none;
    background: transparent;
    font: inherit;
    font-size: 14px;
    font-weight: 500;
    color: #636567;
    padding: 2px 6px;
    border-radius: 4px;
    cursor: pointer;
    &:hover {
        background: #E9EBEC;
        color: #000;
    }
`

const iconBtnClass = css`
    border: none;
    background: transparent;
    border-radius: 8px;
    display: grid;
    place-items: center;
    cursor: pointer;
    color: #636567;
    padding: 0;
    &:hover {
        background: #E9EBEC;
        color: #000;
    }
`

// ── Shimmer helper ────────────────────────────────────────────────────────────

const shimmerStyle: React.CSSProperties = {
    background: 'linear-gradient(90deg, #F5F6F7 25%, #E9EBEC 50%, #F5F6F7 75%)',
    backgroundSize: '200% 100%',
    animation: `${shimmerAnim} 1.4s infinite linear`,
}

// ── Static styles ─────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
    overlay: {
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 22, 36, 0.55)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 1000,
        padding: 32,
    },
    modal: {
        background: '#fff',
        borderRadius: 16,
        width: 'min(1240px, 100%)',
        height: 'min(820px, 100%)',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 24px 60px rgba(15,22,36,0.35), 0 8px 24px rgba(15,22,36,0.18)',
        overflow: 'hidden',
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '16px 20px',
        borderBottom: '1px solid #DCDFE1',
        flexShrink: 0,
    },
    scrollArea: {
        flex: 1,
        overflowY: 'auto',
        padding: '20px 24px 24px',
    },
    section: {
        marginBottom: 28,
    },
    eyebrow: {
        fontFamily: 'ui-monospace, monospace',
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: '#636567',
        marginBottom: 12,
    },
    folderGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
        gap: 8,
    },
    folderIcon: {
        width: 36,
        height: 36,
        background: '#F5F6F7',
        borderRadius: 6,
        display: 'grid',
        placeItems: 'center',
        color: '#636567',
        flexShrink: 0,
    },
    folderName: {
        flex: 1,
        fontSize: 14,
        fontWeight: 600,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
    },
    cardGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(232px, 1fr))',
        gap: 16,
    },
    cardThumb: {
        position: 'relative',
        aspectRatio: '16 / 10',
        background: '#E9EBEC',
        overflow: 'hidden',
    },
    cardThumbImg: {
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        display: 'block',
    },
    cardMeta: {
        padding: '12px 12px 14px',
        flex: 1,
    },
    cardTitle: {
        fontSize: 14,
        fontWeight: 600,
        color: '#000',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
    },
    emptyState: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: 48,
        minHeight: 360,
    },
    crumbCurrent: {
        fontSize: 14,
        fontWeight: 700,
        color: '#000',
        padding: '2px 6px',
    },
}

// ── Skeleton components ───────────────────────────────────────────────────────

function FoldersSkeleton() {
    return (
        <section style={s.section}>
            <div style={{ ...s.eyebrow, ...shimmerStyle, width: 56, height: 11, borderRadius: 4 }} />
            <div style={{ ...s.folderGrid, marginTop: 12 }}>
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        border: '1px solid #DCDFE1', background: '#fff',
                        borderRadius: 8, padding: '12px 14px',
                    }}>
                        <div style={{ ...s.folderIcon, background: undefined, ...shimmerStyle }} />
                        <div style={{ flex: 1, height: 14, borderRadius: 4, ...shimmerStyle }} />
                        <div style={{ width: 14, height: 14, borderRadius: 4, ...shimmerStyle }} />
                    </div>
                ))}
            </div>
        </section>
    )
}

function ExperiencesSkeleton() {
    return (
        <section style={s.section}>
            <div style={{ ...s.eyebrow, ...shimmerStyle, width: 160, height: 11, borderRadius: 4 }} />
            <div style={{ ...s.cardGrid, marginTop: 12 }}>
                {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} style={{ border: '1px solid #DCDFE1', borderRadius: 8, background: '#fff', overflow: 'hidden' }}>
                        <div style={{ aspectRatio: '16 / 10', ...shimmerStyle }} />
                        <div style={{ padding: '12px 12px 14px' }}>
                            <div style={{ height: 14, borderRadius: 4, ...shimmerStyle }} />
                        </div>
                    </div>
                ))}
            </div>
        </section>
    )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CerosMark() {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
                width: 28, height: 28, borderRadius: 8, background: '#000',
                display: 'grid', placeItems: 'center', color: '#fff',
                fontWeight: 700, fontSize: 16, letterSpacing: '-0.04em',
            }}>
                c
            </div>
            <div>
                <div style={{ fontSize: 14, fontWeight: 700, lineHeight: '1.1' }}>Ceros</div>
                <div style={{ fontSize: 10, color: '#636567', lineHeight: '1.1', marginTop: 2 }}>Experience picker</div>
            </div>
        </div>
    )
}

function FolderRow({ folder, onOpen }: { folder: FolderNode; onOpen: (folder: FolderNode) => void }) {
    return (
        <button type="button" className={folderRowClass} onClick={() => onOpen(folder)}>
            <div style={s.folderIcon}>
                <FolderFilledIcon />
            </div>
            <div style={s.folderName}>{folder.name}</div>
            <span style={{ color: '#979A9B', display: 'flex' }}>
                <ChevronRightIcon />
            </span>
        </button>
    )
}

function ExperienceCard({
    exp,
    loading,
    disabled,
    onSelect,
}: {
    exp: ExperienceNode
    loading: boolean
    disabled: boolean
    onSelect: (exp: ExperienceNode) => void
}) {
    return (
        <button
            type="button"
            className={cardClass}
            onClick={() => onSelect(exp)}
            disabled={disabled}
            title={exp.name}
        >
            <div style={s.cardThumb}>
                {exp.thumbnailUrl ? (
                    <img src={exp.thumbnailUrl} alt="" style={s.cardThumbImg} />
                ) : (
                    <div style={{ width: '100%', height: '100%', background: '#E9EBEC' }} />
                )}
                {loading && (
                    <div style={{
                        position: 'absolute', inset: 0,
                        display: 'grid', placeItems: 'center',
                        background: 'rgba(255,255,255,0.75)',
                    }}>
                        <div style={{
                            width: 20, height: 20,
                            border: '2.5px solid #000',
                            borderTopColor: 'transparent',
                            borderRadius: '50%',
                            animation: `${spinAnim} 0.7s linear infinite`,
                        }} />
                    </div>
                )}
            </div>
            <div style={s.cardMeta}>
                <div style={s.cardTitle}>{exp.name}</div>
            </div>
        </button>
    )
}

function EmptyFolderState() {
    return (
        <div style={s.emptyState}>
            <svg viewBox="0 0 120 100" width="120" height="100" aria-hidden="true">
                <rect x="10" y="30" width="100" height="62" rx="8" fill="#E9EBEC" />
                <path d="M10 38a8 8 0 0 1 8-8h22l8 8h54a8 8 0 0 1 8 8v6H10z" fill="#DCDFE1" />
                <circle cx="60" cy="65" r="14" fill="none" stroke="#979A9B" strokeWidth="2" strokeDasharray="3 4" />
            </svg>
            <div style={{ fontSize: 16, fontWeight: 600, marginTop: 16 }}>This folder is empty</div>
            <div style={{ fontSize: 14, color: '#636567', marginTop: 4 }}>
                Published experiences in this folder will show up here.
            </div>
        </div>
    )
}

// ── Main component ────────────────────────────────────────────────────────────

export interface ExperiencePickerProps {
    isShown: boolean
    onClose: () => void
    onSelect: (experience: SelectedExperience) => void
}

type FolderCacheEntry =
    | { status: 'loading' }
    | { status: 'ready'; experiences: ExperienceNode[] }
    | { status: 'error' }

export function ExperiencePicker({ isShown, onClose, onSelect }: ExperiencePickerProps) {
    const sdk = useSDK<EditorAppSDK>()

    const [appActionId, setAppActionId] = useState<string | null>(null)
    const [folders, setFolders] = useState<FolderNode[]>([])
    const [currentFolder, setCurrentFolder] = useState<FolderNode | null>(null)
    const [experienceCache, setExperienceCache] = useState<Record<string, FolderCacheEntry>>({})
    const [loading, setLoading] = useState(false)
    const [loadingExpId, setLoadingExpId] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [expError, setExpError] = useState<string | null>(null)

    const callFunction = async (actionId: string, params: Record<string, unknown>) => {
        const call = await sdk.cma.appActionCall.createWithResult(
            {
                spaceId: sdk.ids.space,
                environmentId: sdk.ids.environment,
                appDefinitionId: sdk.ids.app || '',
                appActionId: actionId,
            },
            { parameters: params }
        )
        if (call.sys.status === 'failed') {
            const err = (call.sys as any).error
            throw new Error(`Function call failed: ${err?.message ?? JSON.stringify(err)}`)
        }
        return (call.sys as any).result as Record<string, unknown>
    }

    const prefetchFolder = (folder: FolderNode, actionId: string): Promise<void> => {
        setExperienceCache(prev => ({ ...prev, [folder.resourceId]: { status: 'loading' } }))
        return callFunction(actionId, { action: 'getFolderExperiences', folderId: folder.resourceId })
            .then(data => {
                if (data.error) throw new Error(String(data.error))
                setExperienceCache(prev => ({
                    ...prev,
                    [folder.resourceId]: { status: 'ready', experiences: (data.experiences as ExperienceNode[]) ?? [] },
                }))
            })
            .catch(() => {
                setExperienceCache(prev => ({ ...prev, [folder.resourceId]: { status: 'error' } }))
            })
    }

    // Drains a shared queue with `limit` concurrent workers (fire-and-forget)
    const prefetchWithConcurrency = (foldersToFetch: FolderNode[], actionId: string, limit = 3) => {
        const queue = [...foldersToFetch]
        const worker = async () => {
            while (queue.length > 0) {
                const folder = queue.shift()!
                await prefetchFolder(folder, actionId)
            }
        }
        Array.from({ length: Math.min(limit, foldersToFetch.length) }, worker)
    }

    // Reset + load folders when modal opens
    useEffect(() => {
        if (!isShown) {
            setFolders([])
            setCurrentFolder(null)
            setExperienceCache({})
            setError(null)
            setExpError(null)
            setLoadingExpId(null)
            setAppActionId(null)
            return
        }

        setLoading(true)
        setError(null)
        ;(async () => {
            try {
                const actionsResponse = await sdk.cma.appAction.getMany({
                    organizationId: sdk.ids.organization,
                    appDefinitionId: sdk.ids.app || '',
                })
                const cerosAction = actionsResponse.items.find((a) => a.name === 'CerosApi')
                if (!cerosAction) {
                    setError('The CerosApi App Action is not set up. Run "npm run create-app-action" after deploying.')
                    return
                }
                const actionId = cerosAction.sys.id
                setAppActionId(actionId)
                const data = await callFunction(actionId, { action: 'getFolderTree' })
                if (data.error) throw new Error(String(data.error))
                const loadedFolders = (data.folders as FolderNode[]) ?? []
                setFolders(loadedFolders)
                prefetchWithConcurrency(loadedFolders, actionId) // background, non-blocking
            } catch (err) {
                console.error('[CerosApi] getFolderTree error:', err)
                setError(err instanceof Error ? err.message : String(err))
            } finally {
                setLoading(false)
            }
        })()
    }, [isShown]) // eslint-disable-line react-hooks/exhaustive-deps

    // Escape key to close
    useEffect(() => {
        if (!isShown) return
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [isShown, onClose])

    const handleFolderOpen = (folder: FolderNode) => {
        setCurrentFolder(folder)
        setExpError(null)
        // Retry if not in cache or previously errored
        const entry = experienceCache[folder.resourceId]
        if (!entry || entry.status === 'error') {
            prefetchFolder(folder, appActionId!)
        }
    }

    const handleBack = () => {
        setCurrentFolder(null)
        setExpError(null)
    }

    const handleExperienceClick = async (exp: ExperienceNode) => {
        if (!appActionId || loadingExpId) return
        setLoadingExpId(exp.resourceId)
        setExpError(null)
        try {
            const data = await callFunction(appActionId, {
                action: 'getEmbedCode',
                resourceId: exp.resourceId,
            })
            if (data.error) throw new Error(String(data.error))
            onSelect({
                name: exp.name,
                url: String(data.url ?? ''),
                embedCode: String(data.embedCode ?? ''),
            })
        } catch (err) {
            console.error('[CerosApi] getEmbedCode error:', err)
            setExpError(err instanceof Error ? err.message : String(err))
            setLoadingExpId(null)
        }
    }

    if (!isShown) return null

    const isInFolder = currentFolder !== null
    const cacheEntry = currentFolder ? experienceCache[currentFolder.resourceId] : undefined

    const bodyContent = () => {
        if (error) {
            return (
                <div style={{ padding: '4px 0' }}>
                    <Note variant="negative">{error}</Note>
                </div>
            )
        }

        if (loading) return <FoldersSkeleton />

        if (isInFolder) {
            if (!cacheEntry || cacheEntry.status === 'loading') return <ExperiencesSkeleton />
            if (cacheEntry.status === 'error') {
                return (
                    <div style={{ padding: '4px 0' }}>
                        <Note variant="negative">
                            Failed to load experiences for this folder. Go back and try opening it again.
                        </Note>
                    </div>
                )
            }
            if (cacheEntry.experiences.length === 0) return <EmptyFolderState />
            return (
                <section style={s.section}>
                    {expError && (
                        <div style={{ marginBottom: 12 }}>
                            <Note variant="negative">{expError}</Note>
                        </div>
                    )}
                    <div style={s.cardGrid}>
                        {cacheEntry.experiences.map((exp) => (
                            <ExperienceCard
                                key={exp.resourceId}
                                exp={exp}
                                loading={loadingExpId === exp.resourceId}
                                disabled={loadingExpId !== null}
                                onSelect={handleExperienceClick}
                            />
                        ))}
                    </div>
                </section>
            )
        }

        if (folders.length === 0) {
            return (
                <div style={s.emptyState}>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>No folders found</div>
                    <div style={{ fontSize: 14, color: '#636567', marginTop: 4 }}>
                        No folders are available in your Ceros account.
                    </div>
                </div>
            )
        }

        return (
            <section style={s.section}>
                <div style={s.folderGrid}>
                    {folders.map((folder) => (
                        <FolderRow key={folder.resourceId} folder={folder} onOpen={handleFolderOpen} />
                    ))}
                </div>
            </section>
        )
    }

    return createPortal(
        <div
            style={s.overlay}
            onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
        >
            <div style={s.modal} role="dialog" aria-modal="true" aria-label="Pick a Ceros experience">

                {/* Header */}
                <header style={s.header}>
                    <CerosMark />
                    <div style={{ flex: 1 }} />
                    <button
                        type="button"
                        className={cx(iconBtnClass, css`width: 32px; height: 32px;`)}
                        aria-label="Close"
                        onClick={onClose}
                    >
                        <CloseIcon />
                    </button>
                </header>

                {/* Scrollable body */}
                <div style={s.scrollArea}>
                    {/* Breadcrumb */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 20 }}>
                        {isInFolder && (
                            <button
                                type="button"
                                className={cx(iconBtnClass, css`width: 24px; height: 24px; border-radius: 4px; margin-left: -4px;`)}
                                onClick={handleBack}
                                aria-label="Back to folders"
                            >
                                <BackIcon />
                            </button>
                        )}
                        {isInFolder ? (
                            <>
                                <button type="button" className={crumbBtnClass} onClick={handleBack}>
                                    All folders
                                </button>
                                <span style={{ color: '#979A9B', display: 'flex', alignItems: 'center' }}>
                                    <ChevronRightIcon />
                                </span>
                                <span style={s.crumbCurrent}>{currentFolder.name}</span>
                            </>
                        ) : (
                            <span style={s.crumbCurrent}>All folders</span>
                        )}
                    </div>
                    {bodyContent()}
                </div>

            </div>
        </div>,
        document.body
    )
}
