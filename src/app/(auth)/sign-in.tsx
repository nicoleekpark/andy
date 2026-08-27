import { StyleSheet, Text, View } from "react-native";
import { colors } from "@/constants/theme";

/**
 * The Sign in with Apple button lands here in the next slice, along with
 * expo-apple-authentication and the native entitlement it needs.
 */
export default function SignInScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Andy</Text>
      <Text style={styles.body}>
        Remember the people you meet — what they do, what you talked about, what
        to follow up on.
      </Text>
      <Text style={styles.pending}>Sign in with Apple arrives in the next slice.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
    padding: 32,
    gap: 12,
    justifyContent: "center",
  },
  title: { color: colors.ink, fontSize: 32 },
  body: { color: colors.ink, fontSize: 16, opacity: 0.75 },
  pending: { color: colors.ink, fontSize: 13, opacity: 0.4, marginTop: 16 },
});
