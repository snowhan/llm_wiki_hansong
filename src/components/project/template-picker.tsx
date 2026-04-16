import Box from "@mui/material/Box"
import Card from "@mui/material/Card"
import CardActionArea from "@mui/material/CardActionArea"
import Typography from "@mui/material/Typography"
import { templates } from "@/lib/templates"

interface TemplatePickerProps {
  selected: string
  onSelect: (id: string) => void
}

export function TemplatePicker({ selected, onSelect }: TemplatePickerProps) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", sm: "repeat(3, minmax(0, 1fr))" },
        gap: 1,
      }}
    >
      {templates.map((template) => {
        const isSelected = selected === template.id
        return (
          <Card
            key={template.id}
            variant="outlined"
            sx={{
              borderColor: isSelected ? "primary.main" : "divider",
              bgcolor: isSelected ? "action.selected" : "background.paper",
              boxShadow: isSelected ? (theme) => `0 0 0 1px ${theme.palette.primary.main}` : undefined,
              transition: (theme) =>
                theme.transitions.create(["border-color", "background-color", "box-shadow"], {
                  duration: theme.transitions.duration.shorter,
                }),
              "&:hover": {
                bgcolor: isSelected ? "action.selected" : "action.hover",
              },
            }}
          >
            <CardActionArea
              onClick={() => onSelect(template.id)}
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: 0.5,
                p: 1.5,
                textAlign: "left",
              }}
            >
              <Box sx={{ fontSize: "1.25rem", lineHeight: 1 }}>{template.icon}</Box>
              <Typography variant="body2" sx={{ fontWeight: 500, lineHeight: 1.25 }}>
                {template.name}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.25 }}>
                {template.description}
              </Typography>
            </CardActionArea>
          </Card>
        )
      })}
    </Box>
  )
}
