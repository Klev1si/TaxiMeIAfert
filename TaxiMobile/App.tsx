import React from 'react';
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';

function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaView style={[styles.root, isDarkMode && styles.dark]}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <View style={styles.center}>
        <Text style={[styles.title, isDarkMode && styles.textLight]}>
          TaxiApp
        </Text>
        <Text style={[styles.sub, isDarkMode && styles.textLight]}>
          Scaffold ready — Phase 1 complete
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#fff'},
  dark: {backgroundColor: '#111'},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  title: {fontSize: 32, fontWeight: '700', color: '#111'},
  textLight: {color: '#f5f5f5'},
  sub: {fontSize: 14, marginTop: 8, color: '#666'},
});

export default App;
