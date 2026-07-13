import { Ionicons } from '@expo/vector-icons'
import * as Linking from 'expo-linking'
import { Pressable, Text, View } from 'react-native'

import { Card, ConnectionBanner, Screen, SectionHeader, uiStyles } from '@/components/product-ui'
import { Colors } from '@/constants/theme'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { useProductStore } from '@/lib/product-store'

export default function KnowledgeScreen() {
  const { sources, knowledge } = useProductStore(); const colors = Colors[useColorScheme() ?? 'light']
  return <Screen><ConnectionBanner /><SectionHeader title="Knowledge" />{knowledge.map((document) => <Card key={document.knowledgeDocumentId}><View style={uiStyles.row}><Ionicons name="library-outline" size={24} color={colors.primary} /><View style={uiStyles.grow}><Text selectable style={[uiStyles.title, { color: colors.text }]}>{document.title}</Text><Text selectable style={{ color: colors.textSecondary, lineHeight: 20 }}>{document.summary}</Text><Text selectable style={[uiStyles.meta, { color: colors.textMuted }]}>{document.kind} · {document.syncState}/{document.indexState} · {document.provenanceIds.join(', ')}</Text></View></View></Card>)}<SectionHeader title="Sources & provenance" />{sources.map((source) => <Card key={source.sourceRefId}><View style={uiStyles.row}><Ionicons name="link-outline" size={22} color={colors.accent} /><View style={uiStyles.grow}><Text selectable style={[uiStyles.title, { color: colors.text }]}>{source.displayName}</Text><Text selectable style={[uiStyles.meta, { color: colors.textSecondary }]}>{source.kind} · {source.syncState}/{source.indexState}</Text><Text selectable style={[uiStyles.meta, { color: colors.textMuted }]}>{source.provenanceIds.join(', ')}</Text></View>{source.sourceUrl ? <Pressable accessibilityRole="link" accessibilityLabel={`Open ${source.displayName}`} style={uiStyles.iconButton} onPress={() => void Linking.openURL(source.sourceUrl!)}><Ionicons name="open-outline" size={20} color={colors.primary} /></Pressable> : null}</View></Card>)}</Screen>
}
