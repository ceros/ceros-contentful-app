import { EditorAppSDK } from '@contentful/app-sdk'
import { Note, Pagination } from '@contentful/f36-components'
import { useSDK } from '@contentful/react-apps-toolkit'
import { css, cx, keyframes } from 'emotion'
import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { callCerosAction, findCerosActionId } from '../ceros-action'

export interface SelectedExperience {
    name: string
    url: string
    embedCode: string
}

interface Paging {
    total: number
    page: number
    pages: number
    pageSize: number
    next?: string
    previous?: string
}

interface FolderNode {
    resourceId: string
    name: string
    isFlexFolder: boolean
    children: FolderNode[]
}

interface ExperienceNode {
    resourceId: string
    name: string
    thumbnailUrl?: string
    isFlexExperience: boolean
}

// Depth-first search for a folder by id within a (possibly nested) tree.
function findFolderNode(tree: FolderNode[], id: string): FolderNode | null {
    for (const node of tree) {
        if (node.resourceId === id) return node
        const found = findFolderNode(node.children, id)
        if (found) return found
    }
    return null
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
                <span style={{ fontSize: 10, fontWeight: 600, color: '#636567', textTransform: 'uppercase' }}>
                    {exp.isFlexExperience ? 'Flex' : 'Studio'}
                </span>
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

// ── Sort options ──────────────────────────────────────────────────────────────

const SORT_OPTIONS: { value: string; label: string }[] = [
    { value: 'last_created', label: 'Created' },
    { value: 'last_updated', label: 'Updated' },
    { value: 'last_published', label: 'Published' },
    { value: 'alphabetical_a_to_z', label: 'A-Z' },
]

// ── Main component ────────────────────────────────────────────────────────────

export interface ExperiencePickerProps {
    isShown: boolean
    onClose: () => void
    onSelect: (experience: SelectedExperience) => void
}

type FolderCacheEntry =
    | { status: 'loading' }
    | { status: 'ready'; experiences: ExperienceNode[]; paging: Paging | null; page: number }
    | { status: 'error' }

export function ExperiencePicker({ isShown, onClose, onSelect }: ExperiencePickerProps) {
    const sdk = useSDK<EditorAppSDK>()

    const [appActionId, setAppActionId] = useState<string | null>(null)
    const [folders, setFolders] = useState<FolderNode[]>([])
    const [folderStack, setFolderStack] = useState<FolderNode[]>([])
    const [experienceCache, setExperienceCache] = useState<Record<string, FolderCacheEntry>>({})
    const [folderChildren, setFolderChildren] = useState<Record<string, FolderNode[]>>({})
    const [loading, setLoading] = useState(false)
    const [loadingExpId, setLoadingExpId] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [expError, setExpError] = useState<string | null>(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [debouncedSearch, setDebouncedSearch] = useState('')
    const [sort, setSort] = useState('last_created')
    // null = show all; 'flex' or 'studio' = only that type (client-side, loaded items only)
    const [typeFilter, setTypeFilter] = useState<null | 'flex' | 'studio'>(null)
    type EmbedVariant = 'fullHeight' | 'scrollable' | 'inline'
    const EMBED_VARIANTS: EmbedVariant[] = ['fullHeight', 'scrollable', 'inline']
    const [selectedExperience, setSelectedExperience] = useState<
        { exp: ExperienceNode; url: string; embedCodes: Partial<Record<EmbedVariant, string>> } | null
    >(null)
    const [selectedVariant, setSelectedVariant] = useState<EmbedVariant>('fullHeight')

    const callFunction = (actionId: string, params: Record<string, unknown>) =>
        callCerosAction(sdk, actionId, params)

    // Single source of truth for the current folder's list query (sort +
    // search). Both the fetch effect and pagination read it, so they stay
    // in sync with the active Sort/Search controls.
    const buildExperienceQuery = (): Record<string, unknown> => ({
        sort,
        ...(searchTerm ? { search: searchTerm } : {}),
    })

    const fetchFolderPage = (folder: FolderNode, actionId: string, page = 1, extraQuery: Record<string, unknown> = {}) => {
        setExperienceCache((prev) => ({ ...prev, [folder.resourceId]: { status: 'loading' } }))
        return callFunction(actionId, {
            action: 'getFolderExperiences',
            folderId: folder.resourceId,
            query: JSON.stringify({ page, ...extraQuery }),
        })
            .then((res) => {
                if (res.error) throw new Error(String(res.error))
                setExperienceCache((prev) => ({
                    ...prev,
                    [folder.resourceId]: {
                        status: 'ready',
                        experiences: (res.data as ExperienceNode[]) ?? [],
                        paging: res.paging ?? null,
                        page,
                    },
                }))
            })
            .catch(() => {
                setExperienceCache((prev) => ({ ...prev, [folder.resourceId]: { status: 'error' } }))
            })
    }

    // Lazy-load a folder's children on open. `depth` is provided by the caller
    // (computed from the folder's position in the stack). The response may
    // include other folders, so we locate this folder within it and take its
    // children.
    const loadSubFolders = async (folder: FolderNode, actionId: string, depth: number) => {
        if (folder.children.length > 0 || folderChildren[folder.resourceId]) return
        const res = await callFunction(actionId, {
            action: 'getFolderTree',
            query: JSON.stringify({ folder: folder.resourceId, depth }),
        })
        if (!res.error) {
            const raw = (res.data as FolderNode[]) ?? []
            const node = findFolderNode(raw, folder.resourceId)
            const kids = node ? node.children : raw
            setFolderChildren((prev) => ({ ...prev, [folder.resourceId]: kids }))
        }
    }

    // Reset + load folders when modal opens
    useEffect(() => {
        if (!isShown) {
            setFolders([])
            setFolderStack([])
            setExperienceCache({})
            setFolderChildren({})
            setError(null)
            setExpError(null)
            setLoadingExpId(null)
            setAppActionId(null)
            setSelectedExperience(null)
            return
        }

        setLoading(true)
        setError(null)
        ;(async () => {
            try {
                const actionId = await findCerosActionId(sdk)
                setAppActionId(actionId)
                const treeResult = await callFunction(actionId, {
                    action: 'getFolderTree',
                    query: JSON.stringify({ depth: 2 }),
                })
                if (treeResult.error) throw new Error(String(treeResult.error))
                const loadedFolders = (treeResult.data as FolderNode[]) ?? []
                setFolders(loadedFolders)
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

    // Debounced mirror of the search input, used below so typing doesn't
    // trigger a fetch on every keystroke.
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(searchTerm), 300)
        return () => clearTimeout(t)
    }, [searchTerm])

    // Single source of truth for loading the current folder's experiences:
    // fetches page 1 whenever the active folder, sort, debounced search
    // term, or appActionId changes. This guarantees the visible page-1 data
    // always matches the active folder + Sort + Search controls.
    useEffect(() => {
        const folder = folderStack[folderStack.length - 1]
        if (!folder || !appActionId) return
        fetchFolderPage(folder, appActionId, 1, buildExperienceQuery())
    }, [folderStack, sort, debouncedSearch, appActionId]) // eslint-disable-line react-hooks/exhaustive-deps

    const handleFolderOpen = (folder: FolderNode) => {
        // Request enough depth to include this folder's children: the folder
        // being opened is one level below the current stack, and its children are
        // one level beyond that → folderStack.length + 2.
        const childDepth = folderStack.length + 2
        setFolderStack(prev => [...prev, folder])
        setExpError(null)
        setSearchTerm('')
        setDebouncedSearch('')
        setTypeFilter(null)
        loadSubFolders(folder, appActionId!, childDepth)
    }

    const handleBack = () => {
        setFolderStack(prev => prev.slice(0, -1))
        setExpError(null)
        setSearchTerm('')
        setDebouncedSearch('')
        setTypeFilter(null)
    }

    const handleNavigateTo = (depth: number) => {
        setFolderStack(prev => prev.slice(0, depth))
        setExpError(null)
        setSearchTerm('')
        setDebouncedSearch('')
        setTypeFilter(null)
    }

    const handleExperienceClick = async (exp: ExperienceNode) => {
        if (!appActionId || loadingExpId) return
        setLoadingExpId(exp.resourceId)
        setExpError(null)
        try {
            const res = await callFunction(appActionId, { action: 'getEmbedCode', resourceId: exp.resourceId })
            if (res.error) throw new Error(String(res.error))
            const d = (res.data as { fullHeightEmbedCode?: string; scrollableEmbedCode?: string; inlineEmbedCode?: string; url?: string }) ?? {}
            const embedCodes: Partial<Record<EmbedVariant, string>> = {}
            if (d.fullHeightEmbedCode) embedCodes.fullHeight = d.fullHeightEmbedCode
            if (d.scrollableEmbedCode) embedCodes.scrollable = d.scrollableEmbedCode
            if (d.inlineEmbedCode) embedCodes.inline = d.inlineEmbedCode
            const defaultVariant = EMBED_VARIANTS.find((v) => embedCodes[v]) ?? 'fullHeight'
            setSelectedVariant(defaultVariant)
            setSelectedExperience({ exp, url: String(d.url ?? ''), embedCodes })
            setLoadingExpId(null)
        } catch (err) {
            console.error('[CerosApi] getEmbedCode error:', err)
            setExpError(err instanceof Error ? err.message : String(err))
            setLoadingExpId(null)
        }
    }

    const handleInsert = () => {
        if (!selectedExperience) return
        const { exp, url, embedCodes } = selectedExperience
        onSelect({ name: exp.name, url, embedCode: embedCodes[selectedVariant] ?? '' })
    }
    const handleBackToBrowse = () => setSelectedExperience(null)

    const VARIANT_LABELS: Record<EmbedVariant, string> = {
        fullHeight: 'Full height (iframe)',
        scrollable: 'Scrollable (iframe)',
        inline: 'Inline',
    }

    const childrenOf = (folder: FolderNode): FolderNode[] =>
        folder.children.length > 0 ? folder.children : folderChildren[folder.resourceId] ?? []

    if (!isShown) return null

    const currentFolder = folderStack[folderStack.length - 1] ?? null
    const isInFolder = folderStack.length > 0
    const cacheEntry = currentFolder ? experienceCache[currentFolder.resourceId] : undefined

    const visibleExperiences = (cacheEntry?.status === 'ready' ? cacheEntry.experiences : []).filter(
        (e) => typeFilter === null || (typeFilter === 'flex' ? e.isFlexExperience : !e.isFlexExperience)
    )

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
            const subFolders = currentFolder ? childrenOf(currentFolder) : []
            const hasExperiences = cacheEntry?.status === 'ready' && cacheEntry.experiences.length > 0
            return (
                <>
                    {expError && (
                        <div style={{ marginBottom: 12 }}>
                            <Note variant="negative">{expError}</Note>
                        </div>
                    )}
                    {subFolders.length > 0 && (
                        <section style={s.section}>
                            {hasExperiences && <div style={s.eyebrow}>Folders</div>}
                            <div style={s.folderGrid}>
                                {subFolders.map((f) => (
                                    <FolderRow key={f.resourceId} folder={f} onOpen={handleFolderOpen} />
                                ))}
                            </div>
                        </section>
                    )}
                    {(!cacheEntry || cacheEntry.status === 'loading') && <ExperiencesSkeleton />}
                    {cacheEntry?.status === 'error' && (
                        <div style={{ padding: '4px 0' }}>
                            <Note variant="negative">
                                Failed to load experiences for this folder. Go back and try opening it again.
                            </Note>
                        </div>
                    )}
                    {cacheEntry?.status === 'ready' && cacheEntry.experiences.length > 0 && (
                        <section style={s.section}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                <div style={s.eyebrow}>Experiences</div>
                                <select value={typeFilter ?? ''} onChange={(e) => setTypeFilter((e.target.value || null) as any)}
                                        style={{ marginLeft: 'auto', font: 'inherit', fontSize: 14, padding: '4px 8px' }}>
                                    <option value="">All experiences</option>
                                    <option value="studio">Created with Studio</option>
                                    <option value="flex">Created with Flex</option>
                                </select>
                                <select value={sort} onChange={(e) => setSort(e.target.value)}
                                        style={{ font: 'inherit', fontSize: 14, padding: '4px 8px' }}>
                                    {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                            </div>
                            {visibleExperiences.length > 0 ? (
                                <div style={s.cardGrid}>
                                    {visibleExperiences.map((exp) => (
                                        <ExperienceCard
                                            key={exp.resourceId}
                                            exp={exp}
                                            loading={loadingExpId === exp.resourceId}
                                            disabled={loadingExpId !== null}
                                            onSelect={handleExperienceClick}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <Note variant="neutral">
                                    No {typeFilter === 'flex' ? 'Flex' : 'Studio'} experiences on this page. Try another page or clear the filter.
                                </Note>
                            )}
                        </section>
                    )}
                    {cacheEntry?.status === 'ready' && cacheEntry.paging && cacheEntry.paging.pages > 1 && currentFolder && (
                        <Pagination
                            activePage={cacheEntry.page - 1}
                            itemsPerPage={cacheEntry.paging.pageSize}
                            totalItems={cacheEntry.paging.total}
                            isLastPage={!cacheEntry.paging.next}
                            pageLength={cacheEntry.experiences.length}
                            onPageChange={(p) => appActionId && fetchFolderPage(currentFolder, appActionId, p + 1, buildExperienceQuery())}
                        />
                    )}
                    {cacheEntry?.status === 'ready' && cacheEntry.experiences.length === 0 && subFolders.length === 0 && (
                        <EmptyFolderState />
                    )}
                </>
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
                    {selectedExperience ? (
                        <div>
                            <button type="button" className={crumbBtnClass} onClick={handleBackToBrowse} style={{ marginBottom: 20 }}>
                                ‹ Back to browsing
                            </button>
                            <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
                                <div style={{ ...s.cardThumb, width: 280, flexShrink: 0, borderRadius: 8, border: '1px solid #DCDFE1' }}>
                                    {selectedExperience.exp.thumbnailUrl
                                        ? <img src={selectedExperience.exp.thumbnailUrl} alt="" style={s.cardThumbImg} />
                                        : <div style={{ width: '100%', height: '100%', background: '#E9EBEC' }} />}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{selectedExperience.exp.name}</h2>
                                        <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#636567', border: '1px solid #DCDFE1', borderRadius: 999, padding: '3px 8px' }}>
                                            {selectedExperience.exp.isFlexExperience ? 'Flex' : 'Studio'}
                                        </span>
                                    </div>
                                    {selectedExperience.url && (
                                        <div style={{ fontSize: 13, color: '#636567', marginTop: 6, wordBreak: 'break-all' }}>{selectedExperience.url}</div>
                                    )}
                                    <div style={{ ...s.eyebrow, marginTop: 24 }}>Embed style</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                                        {EMBED_VARIANTS
                                            .filter((v) => selectedExperience.embedCodes[v])
                                            .map((v) => (
                                                <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
                                                    <input type="radio" name="embed-variant" checked={selectedVariant === v} onChange={() => setSelectedVariant(v)} />
                                                    {VARIANT_LABELS[v]}
                                                </label>
                                            ))}
                                    </div>
                                    <div style={{ display: 'flex', gap: 12, marginTop: 28 }}>
                                        <button type="button" className={folderRowClass} style={{ width: 'auto', padding: '10px 18px' }} onClick={handleBackToBrowse}>Back</button>
                                        <button type="button" className={folderRowClass} disabled={!selectedExperience.embedCodes[selectedVariant]} style={{ width: 'auto', padding: '10px 18px', background: '#000', color: '#fff', borderColor: '#000', opacity: selectedExperience.embedCodes[selectedVariant] ? 1 : 0.5, cursor: selectedExperience.embedCodes[selectedVariant] ? 'pointer' : 'not-allowed' }} onClick={handleInsert}>Insert</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Breadcrumb */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
                                {isInFolder && (
                                    <button
                                        type="button"
                                        className={cx(iconBtnClass, css`width: 24px; height: 24px; border-radius: 4px; margin-left: -4px;`)}
                                        onClick={handleBack}
                                        aria-label="Back"
                                    >
                                        <BackIcon />
                                    </button>
                                )}
                                {isInFolder ? (
                                    <button type="button" className={crumbBtnClass} onClick={() => handleNavigateTo(0)}>
                                        All folders
                                    </button>
                                ) : (
                                    <span style={s.crumbCurrent}>All folders</span>
                                )}
                                {folderStack.map((folder, i) => (
                                    <React.Fragment key={folder.resourceId}>
                                        <span style={{ color: '#979A9B', display: 'flex', alignItems: 'center' }}>
                                            <ChevronRightIcon />
                                        </span>
                                        {i < folderStack.length - 1 ? (
                                            <button type="button" className={crumbBtnClass} onClick={() => handleNavigateTo(i + 1)}>
                                                {folder.name}
                                            </button>
                                        ) : (
                                            <span style={s.crumbCurrent}>{folder.name}</span>
                                        )}
                                    </React.Fragment>
                                ))}
                                {isInFolder && (
                                    <input
                                        type="text"
                                        value={searchTerm}
                                        placeholder={`Search in ${currentFolder?.name ?? 'folder'}`}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        style={{ marginLeft: 'auto', padding: '6px 10px', border: '1px solid #DCDFE1', borderRadius: 6, font: 'inherit', fontSize: 14 }}
                                    />
                                )}
                            </div>
                            {bodyContent()}
                        </>
                    )}
                </div>

            </div>
        </div>,
        document.body
    )
}
