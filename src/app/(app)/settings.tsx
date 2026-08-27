import { useAuth } from "@clerk/expo";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ScreenPlaceholder } from "@/components/screen-placeholder";
import { colors } from "@/constants/theme";

export default function SettingsScreen() {
  const { signOut } = useAuth();

  return (
    <View style={styles.container}>
      <ScreenPlaceholder
        title="Settings"
        note="Choose what Andy can reach — contacts, calendar — and manage your account."
      />
      <Pressable
        style={styles.signOut}
        onPress={() => signOut()}
        accessibilityRole="button"
      >
        <Text style={styles.signOutLabel}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  signOut: {
    margin: 24,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
  },
  signOutLabel: { color: colors.moss, fontSize: 16 },
});
