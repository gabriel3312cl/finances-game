package main

import (
	"bufio"
	"fmt"
	"os"
	"regexp"
	"strings"
)

func main() {
	// Open database/02_schema_and_data.sql for appending
	f, err := os.OpenFile("database/02_schema_and_data.sql", os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		fmt.Printf("Error opening 02_schema_and_data.sql: %v\n", err)
		return
	}
	defer f.Close()

	// Redirect stdout to the file? Or just Fprintf
	// Easier to just use Fprintf

	// 1. Community Chest
	fmt.Fprintf(f, "\n\n-- Community Chest Cards\n")
	fmt.Fprintf(f, "CREATE TABLE IF NOT EXISTS community_chest_cards (\n")
	fmt.Fprintf(f, "    id SERIAL PRIMARY KEY,\n")
	fmt.Fprintf(f, "    title VARCHAR(255),\n")
	fmt.Fprintf(f, "    description TEXT,\n")
	fmt.Fprintf(f, "    action TEXT\n")
	fmt.Fprintf(f, ");\n")
	fmt.Fprintf(f, "TRUNCATE community_chest_cards RESTART IDENTITY;\n")
	parseCards(f, "bases/tarjetas arca comunal.txt", "community_chest_cards")

	// 2. Chance Cards
	fmt.Fprintf(f, "\n-- Chance Cards\n")
	fmt.Fprintf(f, "CREATE TABLE IF NOT EXISTS chance_cards (\n")
	fmt.Fprintf(f, "    id SERIAL PRIMARY KEY,\n")
	fmt.Fprintf(f, "    title VARCHAR(255),\n")
	fmt.Fprintf(f, "    description TEXT,\n")
	fmt.Fprintf(f, "    action TEXT\n")
	fmt.Fprintf(f, ");\n")
	fmt.Fprintf(f, "TRUNCATE chance_cards RESTART IDENTITY;\n")
	parseCards(f, "bases/tarjetas de fortuna.txt", "chance_cards")

	// 3. Properties
	fmt.Fprintf(f, "\n-- Properties\n")
	fmt.Fprintf(f, "CREATE TABLE IF NOT EXISTS properties (\n")
	fmt.Fprintf(f, "    id TEXT PRIMARY KEY,\n") // e.g. '1.1.1'
	fmt.Fprintf(f, "    group_id VARCHAR(50),\n")
	fmt.Fprintf(f, "    name VARCHAR(255),\n")
	fmt.Fprintf(f, "    price INT,\n")
	fmt.Fprintf(f, "    rent_base INT,\n")
	fmt.Fprintf(f, "    rent_color_group INT,\n")
	fmt.Fprintf(f, "    rent_1_house INT,\n")
	fmt.Fprintf(f, "    rent_2_house INT,\n")
	fmt.Fprintf(f, "    rent_3_house INT,\n")
	fmt.Fprintf(f, "    rent_4_house INT,\n")
	fmt.Fprintf(f, "    rent_hotel INT,\n")
	fmt.Fprintf(f, "    house_cost INT,\n")
	fmt.Fprintf(f, "    hotel_cost INT,\n")
	fmt.Fprintf(f, "    mortgage_value INT,\n")
	fmt.Fprintf(f, "    unmortgage_value INT,\n")
	fmt.Fprintf(f, "    type VARCHAR(50) DEFAULT 'PROPERTY'\n")
	fmt.Fprintf(f, ");\n")
	fmt.Fprintf(f, "TRUNCATE properties;\n")
	parseProperties(f, "bases/titulos de pripiedad Chile.txt")

	fmt.Println("Successfully appended data to database/02_schema_and_data.sql")
}

func parseCards(w *os.File, filename string, tableName string) {
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
				fmt.Fprintf(w, "INSERT INTO %s (title, description, action) VALUES ('%s', '%s', '%s');\n",
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
		fmt.Fprintf(w, "INSERT INTO %s (title, description, action) VALUES ('%s', '%s', '%s');\n",
			tableName, escape(title), escape(desc), escape(action))
	}
}

func parseProperties(w *os.File, filename string) {
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
			if id, ok := currentProp["id"].(string); ok && id != "" {
				printPropertyInsert(w, currentProp)
				currentProp = make(map[string]interface{})
			}
			continue
		}

		if matches := idRegex.FindStringSubmatch(line); matches != nil {
			id := matches[1]
			name := matches[3]

			if strings.Count(id, ".") == 1 && !strings.HasPrefix(name, "Aeropuerto") && !strings.HasPrefix(name, "Terminal") && !strings.HasPrefix(name, "Estación") {
				continue
			}

			if _, ok := currentProp["id"]; ok {
				printPropertyInsert(w, currentProp)
				currentProp = make(map[string]interface{})
			}

			currentProp["id"] = id
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

		if matches := valRegex.FindStringSubmatch(line); matches != nil {
			currentProp["price"] = matches[1]
		}
		if matches := rentRegex.FindStringSubmatch(line); matches != nil {
			currentProp["rent_base"] = matches[1]
		}

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
	if _, ok := currentProp["id"]; ok {
		printPropertyInsert(w, currentProp)
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

func printPropertyInsert(w *os.File, p map[string]interface{}) {
	fmt.Fprintf(w, "INSERT INTO properties (id, name, type, price, rent_base, rent_color_group, rent_1_house, rent_2_house, rent_3_house, rent_4_house, rent_hotel, house_cost, hotel_cost, mortgage_value, unmortgage_value) VALUES ('%v', '%v', '%v', %v, %v, %v, %v, %v, %v, %v, %v, %v, %v, %v, %v) ON CONFLICT(id) DO NOTHING;\n",
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
