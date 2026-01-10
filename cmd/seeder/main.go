package main

import (
	"bufio"
	"fmt"
	"os"
	"regexp"
	"strings"
)

func main() {
	// 1. Community Chest
	fmt.Println("-- Community Chest Cards")
	fmt.Println("CREATE TABLE IF NOT EXISTS community_chest_cards (")
	fmt.Println("    id SERIAL PRIMARY KEY,")
	fmt.Println("    title VARCHAR(255),")
	fmt.Println("    description TEXT,")
	fmt.Println("    action TEXT")
	fmt.Println(");")
	fmt.Println("TRUNCATE community_chest_cards RESTART IDENTITY;")
	parseCards("bases/tarjetas arca comunal.txt", "community_chest_cards")

	// 2. Chance Cards
	fmt.Println("\n-- Chance Cards")
	fmt.Println("CREATE TABLE IF NOT EXISTS chance_cards (")
	fmt.Println("    id SERIAL PRIMARY KEY,")
	fmt.Println("    title VARCHAR(255),")
	fmt.Println("    description TEXT,")
	fmt.Println("    action TEXT")
	fmt.Println(");")
	fmt.Println("TRUNCATE chance_cards RESTART IDENTITY;")
	parseCards("bases/tarjetas de fortuna.txt", "chance_cards")

	// 3. Properties
	fmt.Println("\n-- Properties")
	fmt.Println("CREATE TABLE IF NOT EXISTS properties (")
	fmt.Println("    id TEXT PRIMARY KEY,") // e.g. '1.1.1'
	fmt.Println("    group_id VARCHAR(50),")
	fmt.Println("    name VARCHAR(255),")
	fmt.Println("    price INT,")
	fmt.Println("    rent_base INT,")
	fmt.Println("    rent_color_group INT,")
	fmt.Println("    rent_1_house INT,")
	fmt.Println("    rent_2_house INT,")
	fmt.Println("    rent_3_house INT,")
	fmt.Println("    rent_4_house INT,")
	fmt.Println("    rent_hotel INT,")
	fmt.Println("    house_cost INT,")
	fmt.Println("    hotel_cost INT,")
	fmt.Println("    mortgage_value INT,")
	fmt.Println("    unmortgage_value INT,")
	fmt.Println("    type VARCHAR(50) DEFAULT 'PROPERTY'")
	fmt.Println(");")
	fmt.Println("TRUNCATE properties;")
	parseProperties("bases/titulos de pripiedad Chile.txt")
}

func parseCards(filename string, tableName string) {
	file, err := os.Open(filename)
	if err != nil {
		fmt.Printf("-- Error reading %s: %v\n", filename, err)
		return
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	var title, desc, action string

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			if title != "" {
				fmt.Printf("INSERT INTO %s (title, description, action) VALUES ('%s', '%s', '%s');\n",
					tableName, escape(title), escape(desc), escape(action))
				title, desc, action = "", "", ""
			}
			continue
		}

		if strings.HasPrefix(line, "titulo:") {
			title = strings.TrimPrefix(line, "titulo:")
		} else if strings.HasPrefix(line, "descripcion:") {
			desc = strings.TrimPrefix(line, "descripcion:")
		} else if strings.HasPrefix(line, "accion:") {
			action = strings.TrimPrefix(line, "accion:")
		}
	}
	// Last one
	if title != "" {
		fmt.Printf("INSERT INTO %s (title, description, action) VALUES ('%s', '%s', '%s');\n",
			tableName, escape(title), escape(desc), escape(action))
	}
}

func parseProperties(filename string) {
	file, err := os.Open(filename)
	if err != nil {
		fmt.Printf("-- Error reading %s: %v\n", filename, err)
		return
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)

	// State
	var currentProp map[string]interface{}
	currentProp = make(map[string]interface{})

	// Regex
	idRegex := regexp.MustCompile(`^(\d+\.\d+(\.\d+)?) (.+)$`)
	valRegex := regexp.MustCompile(`^valor (\d+)m$`)
	rentRegex := regexp.MustCompile(`^renta (\d+)m$`)

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			// End of block? Not necessarily, blocks might be separated by newlines or headers.
			// Let's assume blank line separates properties if we have an ID
			if id, ok := currentProp["id"].(string); ok && id != "" {
				printPropertyInsert(currentProp)
				currentProp = make(map[string]interface{})
			}
			continue
		}

		// Check for ID line: "1.1.1 Av. La Estrella"
		// But headers like "1.1 grupo 1..." also match logic if not careful.
		// Headers: 1.1, 1.2 ...
		// Properties: 1.1.1, 2.1 ...

		// If line starts with digit...
		if matches := idRegex.FindStringSubmatch(line); matches != nil {
			id := matches[1]
			name := matches[3]

			// Detect if it's a Header (Group) or Property
			// Groups in file: "1.1 grupo 1..."
			// Props: "1.1.1 Av..." or "2.1 Aeropuerto..."

			// If it's a Group definition (e.g. 1.1), we might store it as context,
			// but each property block seems self-contained or we need to inherit color.
			// The file structure shows "1.1 grupo 1, Cerro Navia, azul"

			if strings.Count(id, ".") == 1 && !strings.HasPrefix(name, "Aeropuerto") && !strings.HasPrefix(name, "Terminal") && !strings.HasPrefix(name, "Estación") {
				// Likely a group header like "1.1 grupo 1..."
				// Store group info if needed
				continue
			}

			// If we had a previous property pending, verify if printed.
			if _, ok := currentProp["id"]; ok {
				printPropertyInsert(currentProp)
				currentProp = make(map[string]interface{})
			}

			currentProp["id"] = id
			// Clean name (remove "grupo..." if it matched wrongly? No, regex shouldn't)
			currentProp["name"] = name

			// Type detection
			if strings.HasPrefix(id, "2.") {
				currentProp["type"] = "RAILROAD"
			} else if strings.HasPrefix(id, "3.") {
				currentProp["type"] = "UTILITY"
			} else if strings.HasPrefix(id, "4.") {
				currentProp["type"] = "ATTRACTION"
			} else if strings.HasPrefix(id, "5.") {
				currentProp["type"] = "PARK"
			} else {
				currentProp["type"] = "PROPERTY"
			}

			continue
		}

		// Parse attributes
		if matches := valRegex.FindStringSubmatch(line); matches != nil {
			currentProp["price"] = matches[1]
		}
		if matches := rentRegex.FindStringSubmatch(line); matches != nil {
			currentProp["rent_base"] = matches[1]
		}

		// Heuristics for other fields
		if strings.HasPrefix(line, "renta grupo color") {
			currentProp["rent_color_group"] = extractInt(line)
		}
		if strings.HasPrefix(line, "renta con una casa") {
			currentProp["rent_1_house"] = extractInt(line)
		}
		if strings.HasPrefix(line, "renta con 2 casas") {
			currentProp["rent_2_house"] = extractInt(line)
		}
		if strings.HasPrefix(line, "renta con 3 casas") {
			currentProp["rent_3_house"] = extractInt(line)
		}
		if strings.HasPrefix(line, "renta con 4 casas") {
			currentProp["rent_4_house"] = extractInt(line)
		}
		if strings.HasPrefix(line, "renta con hotel") {
			currentProp["rent_hotel"] = extractInt(line)
		}
		if strings.HasPrefix(line, "casa cuesta") {
			currentProp["house_cost"] = extractInt(line)
		}
		if strings.HasPrefix(line, "hotel cuesta") {
			currentProp["hotel_cost"] = extractInt(line)
		}
		if strings.HasPrefix(line, "hipoteca") {
			currentProp["mortgage_value"] = extractInt(line)
		}
		if strings.HasPrefix(line, "deshipoteca") {
			currentProp["unmortgage_value"] = extractInt(line)
		}
	}
	// Flush last
	if _, ok := currentProp["id"]; ok {
		printPropertyInsert(currentProp)
	}
}

func extractInt(s string) string {
	re := regexp.MustCompile(`(\d+)`)
	matches := re.FindStringSubmatch(s)
	if matches != nil {
		return matches[1]
	}
	return "0"
}

func printPropertyInsert(p map[string]interface{}) {
	fmt.Printf("INSERT INTO properties (id, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES ('%v', '%v', '%v', %v, %v, %v, %v, %v, %v, %v, %v, %v, %v, %v, %v) ON CONFLICT(id) DO NOTHING;\n",
		p["id"], escape(p["name"].(string)), p["type"],
		valOr0(p, "price"), valOr0(p, "rent_base"), valOr0(p, "rent_color_group"),
		valOr0(p, "rent_1_house"), valOr0(p, "rent_2_house"), valOr0(p, "rent_3_house"), valOr0(p, "rent_4_house"),
		valOr0(p, "rent_hotel"), valOr0(p, "house_cost"), valOr0(p, "hotel_cost"),
		valOr0(p, "mortgage_value"), valOr0(p, "unmortgage_value"))
}

func valOr0(m map[string]interface{}, key string) string {
	if v, ok := m[key]; ok {
		return v.(string)
	}
	return "0"
}

func escape(s string) string {
	return strings.ReplaceAll(strings.TrimSpace(s), "'", "''")
}
