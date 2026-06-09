/**
 * CategoryManageScreen.tsx — 사용자 카테고리 관리 화면
 *
 * 이슈 024: 사용자 카테고리 CRUD + 종목 관리
 *
 * 기능:
 * - 카테고리 목록 표시 (이름 + 소속 종목 수)
 * - 카테고리 추가 (이름 입력 인라인 폼)
 * - 카테고리 행 탭 → CategoryStocksScreen으로 이동
 * - 카테고리 행 길게 누르기 → 이름 수정 / 삭제 액션 시트
 * - 삭제 시 확인 다이얼로그 (연결된 메모에서도 해제 안내)
 *
 * 렌더링 최적화:
 * - CategoryRow를 React.memo로 분리하여 목록 항목 리렌더링 방지
 * - useCallback으로 핸들러 참조 안정화
 */

import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useCategories } from '../hooks/useCategories';
import { UserCategoryWithCount } from '../types/category';
import { AuthUser } from '../types/auth';

// ────────────────────────────────────────────
// Props
// ────────────────────────────────────────────

interface CategoryManageScreenProps {
  user: AuthUser;
  onCategoryPress: (category: UserCategoryWithCount) => void;
  onBack: () => void;
}

// ────────────────────────────────────────────
// CategoryRow
// ────────────────────────────────────────────

interface CategoryRowProps {
  category: UserCategoryWithCount;
  onPress: (category: UserCategoryWithCount) => void;
  onLongPress: (category: UserCategoryWithCount) => void;
}

const CategoryRow = React.memo(function CategoryRow({
  category,
  onPress,
  onLongPress,
}: CategoryRowProps) {
  const handlePress = useCallback(() => onPress(category), [category, onPress]);
  const handleLongPress = useCallback(() => onLongPress(category), [category, onLongPress]);

  const stockCount = category.user_category_stocks?.[0]?.count ?? 0;

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={handlePress}
      onLongPress={handleLongPress}
      activeOpacity={0.7}
    >
      <View style={styles.rowLeft}>
        <View style={styles.categoryDot} />
        <Text style={styles.rowName}>{category.name}</Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.stockCountText}>
          {stockCount}개 종목
        </Text>
        <Text style={styles.rowChevron}>›</Text>
      </View>
    </TouchableOpacity>
  );
});

// ────────────────────────────────────────────
// CategoryManageScreen
// ────────────────────────────────────────────

export function CategoryManageScreen({
  user,
  onCategoryPress,
  onBack,
}: CategoryManageScreenProps) {
  const { categories, initialLoading, saving, error, addCategory, renameCategory, removeCategory } =
    useCategories(user.id);

  // 카테고리 추가 인라인 폼 상태
  const [addMode, setAddMode] = useState(false);
  const [newName, setNewName] = useState('');
  const addInputRef = useRef<TextInput>(null);

  // 이름 수정 인라인 폼 상태
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const editInputRef = useRef<TextInput>(null);

  // ── 추가 ──

  const handleShowAddForm = useCallback(() => {
    setAddMode(true);
    setNewName('');
    setTimeout(() => addInputRef.current?.focus(), 100);
  }, []);

  const handleCancelAdd = useCallback(() => {
    setAddMode(false);
    setNewName('');
  }, []);

  const handleConfirmAdd = useCallback(async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;

    try {
      await addCategory(trimmed);
      setAddMode(false);
      setNewName('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '카테고리 생성에 실패했습니다';
      // 409 중복이면 좀 더 친절한 메시지
      const displayMsg = msg.includes('409') || msg.includes('23505')
        ? `'${trimmed}' 이름의 카테고리가 이미 있습니다`
        : msg;
      Alert.alert('오류', displayMsg);
    }
  }, [newName, addCategory]);

  // ── 길게 누르기 → 수정 / 삭제 ──

  const handleLongPress = useCallback(
    (category: UserCategoryWithCount) => {
      Alert.alert(
        category.name,
        '',
        [
          {
            text: '이름 수정',
            onPress: () => {
              setEditingId(category.id);
              setEditName(category.name);
              setTimeout(() => editInputRef.current?.focus(), 100);
            },
          },
          {
            text: '삭제',
            style: 'destructive',
            onPress: () => {
              Alert.alert(
                `'${category.name}' 삭제`,
                '카테고리를 삭제하면 연결된 메모에서도 해제됩니다. 계속하시겠습니까?',
                [
                  { text: '취소', style: 'cancel' },
                  {
                    text: '삭제',
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        await removeCategory(category.id);
                      } catch (e) {
                        const msg = e instanceof Error ? e.message : '삭제 실패';
                        Alert.alert('오류', msg);
                      }
                    },
                  },
                ],
              );
            },
          },
          { text: '취소', style: 'cancel' },
        ],
      );
    },
    [removeCategory],
  );

  // ── 이름 수정 확정 ──

  const handleConfirmRename = useCallback(async () => {
    if (!editingId) return;
    const trimmed = editName.trim();
    if (!trimmed) {
      setEditingId(null);
      return;
    }

    try {
      await renameCategory(editingId, trimmed);
      setEditingId(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '이름 수정에 실패했습니다';
      const displayMsg = msg.includes('409') || msg.includes('23505')
        ? `'${trimmed}' 이름의 카테고리가 이미 있습니다`
        : msg;
      Alert.alert('오류', displayMsg);
    }
  }, [editingId, editName, renameCategory]);

  const handleCancelRename = useCallback(() => {
    setEditingId(null);
    setEditName('');
  }, []);

  // ── 렌더 ──

  const renderItem = useCallback(
    ({ item }: { item: UserCategoryWithCount }) => {
      // 이름 수정 중인 행
      if (editingId === item.id) {
        return (
          <View style={styles.editRow}>
            <TextInput
              ref={editInputRef}
              style={styles.editInput}
              value={editName}
              onChangeText={setEditName}
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleConfirmRename}
              selectTextOnFocus
            />
            <TouchableOpacity
              style={styles.editConfirmBtn}
              onPress={handleConfirmRename}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#003ec7" />
              ) : (
                <Text style={styles.editConfirmText}>확인</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.editCancelBtn} onPress={handleCancelRename}>
              <Text style={styles.editCancelText}>취소</Text>
            </TouchableOpacity>
          </View>
        );
      }

      return (
        <CategoryRow
          category={item}
          onPress={onCategoryPress}
          onLongPress={handleLongPress}
        />
      );
    },
    [
      editingId,
      editName,
      saving,
      handleConfirmRename,
      handleCancelRename,
      onCategoryPress,
      handleLongPress,
    ],
  );

  const renderEmptyList = useCallback(() => {
    if (initialLoading) return null;
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.emptyText}>카테고리가 없습니다</Text>
        <Text style={styles.emptySubText}>아래 추가 버튼으로 첫 카테고리를 만들어 보세요</Text>
      </View>
    );
  }, [initialLoading]);

  if (initialLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Text style={styles.backText}>{'< 설정'}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>카테고리 관리</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#003ec7" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>{'< 설정'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>카테고리 관리</Text>
        <View style={styles.headerRight} />
      </View>

      {/* 오류 배너 */}
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      )}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={90}
      >
        {/* 카테고리 목록 */}
        <FlatList
          data={categories}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListEmptyComponent={renderEmptyList}
          contentContainerStyle={
            categories.length === 0 ? styles.flatListEmptyContainer : styles.flatListContainer
          }
          showsVerticalScrollIndicator={false}
        />

        {/* 카테고리 추가 인라인 폼 */}
        {addMode && (
          <View style={styles.addForm}>
            <TextInput
              ref={addInputRef}
              style={styles.addInput}
              placeholder="새 카테고리 이름"
              placeholderTextColor="#9ca3af"
              value={newName}
              onChangeText={setNewName}
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleConfirmAdd}
              maxLength={50}
            />
            <TouchableOpacity
              style={[styles.addConfirmBtn, saving && styles.btnDisabled]}
              onPress={handleConfirmAdd}
              disabled={saving || !newName.trim()}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.addConfirmText}>추가</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.addCancelBtn} onPress={handleCancelAdd}>
              <Text style={styles.addCancelText}>취소</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* + 카테고리 추가 버튼 */}
        {!addMode && (
          <View style={styles.addButtonRow}>
            <TouchableOpacity style={styles.addButton} onPress={handleShowAddForm} activeOpacity={0.8}>
              <Text style={styles.addButtonText}>+ 카테고리 추가</Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ────────────────────────────────────────────
// 스타일
// ────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f8f9ff',
  },
  flex: {
    flex: 1,
  },
  // 헤더
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5eeff',
  },
  backBtn: {
    minWidth: 60,
  },
  backText: {
    fontSize: 14,
    color: '#003ec7',
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0b1c30',
  },
  headerRight: {
    minWidth: 60,
  },
  // 로딩
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 오류 배너
  errorBanner: {
    marginHorizontal: 20,
    marginTop: 12,
    padding: 12,
    backgroundColor: '#ffdad6',
    borderRadius: 10,
  },
  errorBannerText: {
    fontSize: 13,
    color: '#93000a',
  },
  // FlatList 컨테이너
  flatListContainer: {
    paddingTop: 8,
    paddingBottom: 16,
  },
  flatListEmptyContainer: {
    flexGrow: 1,
  },
  // 빈 상태
  emptyBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingBottom: 80,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#434656',
  },
  emptySubText: {
    fontSize: 13,
    color: '#737688',
    textAlign: 'center',
    lineHeight: 20,
  },
  // 카테고리 행
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 14,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  categoryDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#F59E0B',
  },
  rowName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0b1c30',
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stockCountText: {
    fontSize: 12,
    color: '#737688',
    fontWeight: '500',
  },
  rowChevron: {
    fontSize: 18,
    color: '#b0b3c6',
    fontWeight: '400',
  },
  // 이름 수정 행 (인라인)
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#003ec7',
    gap: 8,
  },
  editInput: {
    flex: 1,
    fontSize: 15,
    color: '#0b1c30',
    paddingVertical: 6,
  },
  editConfirmBtn: {
    backgroundColor: '#003ec7',
    borderRadius: 9999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    minWidth: 52,
    alignItems: 'center',
  },
  editConfirmText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
  editCancelBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  editCancelText: {
    fontSize: 13,
    color: '#737688',
    fontWeight: '600',
  },
  // 추가 폼
  addForm: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5eeff',
    gap: 8,
  },
  addInput: {
    flex: 1,
    backgroundColor: '#eff4ff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0b1c30',
  },
  addConfirmBtn: {
    backgroundColor: '#003ec7',
    borderRadius: 9999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minWidth: 56,
    alignItems: 'center',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  addConfirmText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
  addCancelBtn: {
    paddingHorizontal: 4,
    paddingVertical: 10,
  },
  addCancelText: {
    fontSize: 13,
    color: '#737688',
    fontWeight: '600',
  },
  // + 카테고리 추가 버튼
  addButtonRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5eeff',
  },
  addButton: {
    backgroundColor: '#003ec7',
    borderRadius: 9999,
    paddingVertical: 14,
    alignItems: 'center',
  },
  addButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
});
