import Box from "@mui/material/Box"
import Container from "@mui/material/Container"
import Typography from "@mui/material/Typography"

export default function Home() {
	return (
		<Container maxWidth="md">
			<Box sx={{ py: 8 }}>
				<Typography variant="h2" component="h1" gutterBottom>
					Was essen wir heute
				</Typography>
				<Typography variant="body1" color="text.secondary">
					A family meal-planning app.
				</Typography>
			</Box>
		</Container>
	)
}
