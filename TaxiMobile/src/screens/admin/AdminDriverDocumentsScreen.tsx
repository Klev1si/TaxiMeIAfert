import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Sizes } from '../../constants';
import { useColors } from '../../stores/themeStore';
import type { ColorPalette } from '../../constants/colors';
import { adminDocumentsApi, type DriverDocument, type DocumentType, type DocumentStatus } from '../../api/documents';
import { toAlertString } from '../../utils/errorMessage';
import Config from '../../config';
import type { AdminDriverStackScreenProps } from '../../navigation/types';
import { t as tr, useTranslation } from '../../i18n';

type Props = AdminDriverStackScreenProps<'AdminDriverDocuments'>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function docTypeLabel(type: DocumentType): string {
  switch (type) {
    case 'license':              return tr('admin.driverDocuments.docLicense');
    case 'vehicle_registration': return tr('admin.driverDocuments.docRegistration');
    case 'insurance':            return tr('admin.driverDocuments.docInsurance');
    default:                     return tr('admin.driverDocuments.docOther');
  }
}

function statusColor(status: DocumentStatus, colors: ColorPalette): string {
  switch (status) {
    case 'approved': return colors.success;
    case 'rejected': return colors.error;
    default:         return colors.warning ?? '#f59e0b';
  }
}

function statusLabel(status: DocumentStatus): string {
  switch (status) {
    case 'approved': return `✓ ${tr('admin.driverDocuments.approvedLabel')}`;
    case 'rejected': return `✕ ${tr('admin.driverDocuments.rejectedLabel')}`;
    default:         return `○ ${tr('admin.driverDocuments.pendingLabel')}`;
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

/** Convert a relative /uploads/… path to a full URL for <Image>. */
function toAbsoluteUrl(fileUrl: string): string {
  if (fileUrl.startsWith('http')) return fileUrl;
  return `${Config.API_BASE_URL}${fileUrl}`;
}

function isPdf(fileUrl: string): boolean {
  return fileUrl.toLowerCase().endsWith('.pdf');
}

// ── Reject Modal ──────────────────────────────────────────────────────────────

function RejectModal({
  visible,
  docType,
  onConfirm,
  onCancel,
}: {
  visible:   boolean;
  docType:   DocumentType | null;
  onConfirm: (reason: string) => void;
  onCancel:  () => void;
}) {
  const colors = useColors();
  const modal = useMemo(() => getModalStyles(colors), [colors]);
  const { t } = useTranslation();
  const [reason, setReason] = useState('');

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={modal.overlay}>
        <View style={modal.box}>
          <Text style={modal.title}>{t('admin.driverDocuments.rejectTitle')}</Text>
          <Text style={modal.sub}>
            {t('admin.driverDocuments.rejectingMsg', { type: docType ? docTypeLabel(docType) : t('admin.driverDocuments.docOther') })}
          </Text>
          <TextInput
            style={modal.input}
            value={reason}
            onChangeText={setReason}
            placeholder={t('admin.driverDocuments.rejectReasonPlaceholder')}
            placeholderTextColor={colors.textSecondary}
            multiline
            numberOfLines={3}
            accessibilityLabel="Rejection reason, optional"
          />
          <View style={modal.btnRow}>
            <TouchableOpacity
              style={modal.btnCancel}
              onPress={() => { setReason(''); onCancel(); }}
              accessibilityRole="button"
              accessibilityLabel="Cancel">
              <Text style={modal.btnCancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={modal.btnReject}
              onPress={() => { onConfirm(reason); setReason(''); }}
              accessibilityRole="button"
              accessibilityLabel={`Reject ${docType ? docTypeLabel(docType) : 'document'}`}>
              <Text style={modal.btnRejectText}>{t('admin.driverDocuments.rejectBtn')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function getModalStyles(c: ColorPalette) {
  return StyleSheet.create({
    overlay: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center', alignItems: 'center', padding: 24,
    },
    box: { backgroundColor: c.surface, borderRadius: 16, padding: 20, width: '100%' },
    title: { fontSize: 18, fontWeight: '700', color: c.text, marginBottom: 8 },
    sub:   { fontSize: 13, color: c.textSecondary, lineHeight: 18, marginBottom: 14 },
    input: {
      borderWidth: 1, borderColor: c.border, borderRadius: 10,
      padding: 10, fontSize: 14, color: c.text,
      minHeight: 70, textAlignVertical: 'top', marginBottom: 16,
    },
    btnRow:        { flexDirection: 'row', gap: 10 },
    btnCancel:     { flex: 1, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: c.border, alignItems: 'center' },
    btnReject:     { flex: 1, padding: 12, borderRadius: 10, backgroundColor: c.error, alignItems: 'center' },
    btnCancelText: { fontSize: 14, color: c.text, fontWeight: '600' },
    btnRejectText: { fontSize: 14, color: c.white, fontWeight: '700' },
  });
}

// ── Image Lightbox ─────────────────────────────────────────────────────────────

function ImageLightbox({
  url,
  visible,
  onClose,
}: {
  url:     string;
  visible: boolean;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity
        style={lb.overlay}
        activeOpacity={1}
        onPress={onClose}>
        <Image
          source={{ uri: url }}
          style={lb.image}
          resizeMode="contain"
        />
        <Text style={lb.hint}>{tr('admin.driverDocuments.tapToClose')}</Text>
      </TouchableOpacity>
    </Modal>
  );
}

const lb = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center', alignItems: 'center', padding: 16,
  },
  image: { width: '100%', height: '80%' },
  hint:  { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 16 },
});

// ── Document Card ─────────────────────────────────────────────────────────────

function DocumentCard({
  doc,
  actionLoading,
  onApprove,
  onReject,
  onPreview,
}: {
  doc:           DriverDocument;
  actionLoading: string | null;
  onApprove:     (doc: DriverDocument) => void;
  onReject:      (doc: DriverDocument) => void;
  onPreview:     (url: string) => void;
}) {
  const colors = useColors();
  const card = useMemo(() => getCardStyles(colors), [colors]);
  const { t } = useTranslation();
  const busy    = actionLoading === doc.id;
  const isPdf_  = isPdf(doc.fileUrl);
  const absUrl  = toAbsoluteUrl(doc.fileUrl);
  const sColor  = statusColor(doc.status, colors);

  return (
    <View style={card.wrap}>
      {/* Status badge */}
      <View style={[card.badge, { backgroundColor: sColor + '22' }]}>
        <Text style={[card.badgeText, { color: sColor }]}>
          {statusLabel(doc.status)}
        </Text>
      </View>

      {/* Type label */}
      <Text style={card.type}>{docTypeLabel(doc.type)}</Text>
      <Text style={card.meta}>📎 {doc.originalName ?? t('admin.driverDocuments.uploadedFile')}</Text>
      <Text style={card.meta}>📅 {t('admin.driverDocuments.uploadedOn', { date: formatDate(doc.uploadedAt) })}</Text>
      {doc.reviewedAt && (
        <Text style={card.meta}>🔍 {t('admin.driverDocuments.reviewedOn', { date: formatDate(doc.reviewedAt) })}</Text>
      )}
      {doc.status === 'rejected' && doc.rejectionReason && (
        <Text style={card.reason}>{t('admin.driverDocuments.reasonPrefix', { reason: doc.rejectionReason })}</Text>
      )}

      {/* Thumbnail (image only) */}
      {!isPdf_ && (
        <TouchableOpacity
          style={card.thumbWrap}
          onPress={() => onPreview(absUrl)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Preview ${docTypeLabel(doc.type)} image`}>
          <Image
            source={{ uri: absUrl }}
            style={card.thumb}
            resizeMode="cover"
          />
          <Text style={card.thumbHint}>{t('admin.driverDocuments.tapToEnlarge')}</Text>
        </TouchableOpacity>
      )}
      {isPdf_ && (
        <View style={card.pdfBadge}>
          <Text style={card.pdfText}>📄 {t('admin.driverDocuments.pdfDocument')}</Text>
        </View>
      )}

      {/* Actions — only for pending docs */}
      {doc.status === 'pending' && (
        <View style={card.actions}>
          {busy ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <>
              <TouchableOpacity
                style={card.approveBtn}
                onPress={() => onApprove(doc)}
                accessibilityRole="button"
                accessibilityLabel={`Approve ${docTypeLabel(doc.type)}`}>
                <Text style={card.approveBtnText}>{t('admin.driverDocuments.approveBtn')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={card.rejectBtn}
                onPress={() => onReject(doc)}
                accessibilityRole="button"
                accessibilityLabel={`Reject ${docTypeLabel(doc.type)}`}>
                <Text style={card.rejectBtnText}>{t('admin.driverDocuments.rejectBtn')}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
    </View>
  );
}

function getCardStyles(c: ColorPalette) {
  return StyleSheet.create({
    wrap: {
      backgroundColor: c.surface, borderRadius: 14,
      padding: 14, marginBottom: 12,
      borderWidth: 1, borderColor: c.border,
    },
    badge: {
      alignSelf: 'flex-start', borderRadius: 6,
      paddingHorizontal: 8, paddingVertical: 3, marginBottom: 8,
    },
    badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    type:   { fontSize: 16, fontWeight: '700', color: c.text, marginBottom: 4 },
    meta:   { fontSize: 13, color: c.textSecondary, marginBottom: 2 },
    reason: {
      fontSize: 13, color: c.error,
      marginTop: 4, marginBottom: 2, fontStyle: 'italic',
    },

    thumbWrap: { marginTop: 10, borderRadius: 10, overflow: 'hidden' },
    thumb:     { width: '100%', height: 180, backgroundColor: c.border },
    thumbHint: {
      fontSize: 11, color: c.textSecondary,
      textAlign: 'center', marginTop: 4,
    },

    pdfBadge: {
      marginTop: 10, backgroundColor: c.infoLight ?? '#eff6ff',
      borderRadius: 8, padding: 10, alignItems: 'center',
    },
    pdfText: { fontSize: 13, color: c.info ?? '#1d4ed8', fontWeight: '600' },

    actions:        { flexDirection: 'row', gap: 10, marginTop: 12 },
    approveBtn:     { flex: 1, backgroundColor: c.success, borderRadius: 10, padding: 10, alignItems: 'center' },
    rejectBtn:      { flex: 1, borderWidth: 1, borderColor: c.error, borderRadius: 10, padding: 10, alignItems: 'center' },
    approveBtnText: { color: c.white, fontWeight: '700', fontSize: 14 },
    rejectBtnText:  { color: c.error, fontWeight: '700', fontSize: 14 },
  });
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function AdminDriverDocumentsScreen({ route, navigation }: Props) {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { t } = useTranslation();

  const { driverId, driverName } = route.params;

  const [documents, setDocuments]     = useState<DriverDocument[]>([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget]   = useState<DriverDocument | null>(null);
  const [previewUrl, setPreviewUrl]       = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await adminDocumentsApi.getDriverDocuments(driverId);
      setDocuments(res.data);
    } catch {
      Alert.alert(t('common.error'), t('admin.driverDocuments.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [driverId]);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (doc: DriverDocument) => {
    Alert.alert(
      t('admin.driverDocuments.approveTitle'),
      t('admin.driverDocuments.approveMsg', { type: docTypeLabel(doc.type) }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('admin.driverDocuments.approveBtn'),
          onPress: async () => {
            setActionLoading(doc.id);
            try {
              const res = await adminDocumentsApi.approveDocument(driverId, doc.id);
              setDocuments(prev =>
                prev.map(d => d.id === doc.id ? res.data : d),
              );
            } catch (err: any) {
              Alert.alert(t('common.error'), toAlertString(err?.response?.data?.message, t('admin.driverDocuments.approveError')));
            } finally {
              setActionLoading(null);
            }
          },
        },
      ],
    );
  };

  const handleRejectConfirm = async (reason: string) => {
    if (!rejectTarget) return;
    const id = rejectTarget.id;
    setRejectTarget(null);
    setActionLoading(id);
    try {
      const res = await adminDocumentsApi.rejectDocument(driverId, id, reason || undefined);
      setDocuments(prev =>
        prev.map(d => d.id === id ? res.data : d),
      );
    } catch (err: any) {
      Alert.alert(t('common.error'), toAlertString(err?.response?.data?.message, t('admin.driverDocuments.rejectError')));
    } finally {
      setActionLoading(null);
    }
  };

  const pendingCount  = documents.filter(d => d.status === 'pending').length;
  const approvedCount = documents.filter(d => d.status === 'approved').length;
  const rejectedCount = documents.filter(d => d.status === 'rejected').length;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back">
          <Text style={styles.backText}>{t('common.back')}</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.title} numberOfLines={1}>{driverName}</Text>
          <Text style={styles.subtitle}>{t('admin.driverDocuments.title')}</Text>
        </View>
      </View>

      {/* Summary row */}
      {!loading && documents.length > 0 && (
        <View style={styles.summaryRow}>
          <View style={[styles.summaryBadge, { backgroundColor: (colors.warning ?? '#f59e0b') + '22' }]}>
            <Text style={[styles.summaryText, { color: colors.warning ?? '#f59e0b' }]}>
              {pendingCount} {t('admin.driverDocuments.pendingLabel')}
            </Text>
          </View>
          <View style={[styles.summaryBadge, { backgroundColor: colors.success + '22' }]}>
            <Text style={[styles.summaryText, { color: colors.success }]}>
              {approvedCount} {t('admin.driverDocuments.approvedLabel')}
            </Text>
          </View>
          {rejectedCount > 0 && (
            <View style={[styles.summaryBadge, { backgroundColor: colors.error + '22' }]}>
              <Text style={[styles.summaryText, { color: colors.error }]}>
                {rejectedCount} {t('admin.driverDocuments.rejectedLabel')}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Content */}
      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />
          }>
          {documents.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📂</Text>
              <Text style={styles.emptyText}>{t('admin.driverDocuments.emptyMsg')}</Text>
            </View>
          ) : (
            documents.map(doc => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                actionLoading={actionLoading}
                onApprove={handleApprove}
                onReject={d => setRejectTarget(d)}
                onPreview={url => setPreviewUrl(url)}
              />
            ))
          )}
        </ScrollView>
      )}

      {/* Reject modal */}
      <RejectModal
        visible={!!rejectTarget}
        docType={rejectTarget?.type ?? null}
        onConfirm={handleRejectConfirm}
        onCancel={() => setRejectTarget(null)}
      />

      {/* Image lightbox */}
      <ImageLightbox
        url={previewUrl ?? ''}
        visible={!!previewUrl}
        onClose={() => setPreviewUrl(null)}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function getStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Sizes.screenPadding,
      paddingTop: 12,
      paddingBottom: 10,
      backgroundColor: c.surface,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      gap: 12,
    },
    backBtn: {
      paddingVertical: 6,
      paddingRight: 8,
    },
    backText: { fontSize: 14, fontWeight: '600', color: c.primary },
    headerCenter: { flex: 1 },
    title:    { fontSize: 17, fontWeight: '700', color: c.text },
    subtitle: { fontSize: 12, color: c.textSecondary, marginTop: 1 },

    summaryRow: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: Sizes.screenPadding,
      paddingVertical: 10,
      backgroundColor: c.surface,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    summaryBadge: {
      borderRadius: 6,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    summaryText: { fontSize: 12, fontWeight: '700' },

    list:      { padding: 12 },
    empty:     { alignItems: 'center', marginTop: 60 },
    emptyIcon: { fontSize: 48, marginBottom: 12 },
    emptyText: { fontSize: 16, fontWeight: '600', color: c.text, marginBottom: 6 },
    emptyHint: { fontSize: 13, color: c.textSecondary, textAlign: 'center', paddingHorizontal: 32 },
  });
}
