import streamlit as st
import pandas as pd

def simp(val):
    val = str(val)
    if "+" in val:
        return (float(val.strip("+")) + 2)
    elif "DNF" in val:
        return "DNF"
    else:
        return float(val)
    
def remv(lst):
    dnf_count = lst.count("DNF")

    nums = [x for x in lst if x != "DNF"]
    nums.sort()

    if len(nums) >= 2:
        nums = nums[1:-1]  

    for _ in range(dnf_count):
        if nums:
            nums.pop(-1) 

    return nums

def avg(lst):

    sum = 0
    for i in range (len(lst)):
        sum += lst[i]

    avg = sum / len(lst)
    return round(avg, 3)

def best_time(df):
    best_times = {}
    current_best = 10000

    for i in range (len(df) - 1):
        solve = df.iloc[i]
        solve_val = simp(solve["Time"])
        if solve_val == "DNF":
            solve_val = 100000
            

        if solve_val < current_best:
            best_times[int(solve["No."])] = float(solve_val)
            current_best = solve_val

    df = pd.DataFrame(
    list(best_times.items()),
    columns=["x", "y"]
)

    df = df.sort_values("x")

    st.line_chart(df, x="x", y="y", height="content")

    #st.write(best_times)

        
def best_avg(df, num):
    best_times = {}
    current_best = 100

    for i in range (num ,len(df) - 1):
        solve_vals = []

        for j in range (num):
            solve = df.iloc[i - j]
            solve_vals.append(simp(solve["Time"]))

        solve_vals = remv(solve_vals)
        solve_val = avg(solve_vals)

        
        if solve_val < current_best:
            best_times[int(solve["No."] + num - 1)] = float(solve_val)
            current_best = solve_val


    df = pd.DataFrame(
    list(best_times.items()),
    columns=["x", "y"]
)

    df = df.sort_values("x")

    st.line_chart(df, x="x", y="y", height="content")

    #st.write(best_times)

def all_avg(df, num):
    times = {}
    current_best = 100

    for i in range (num ,len(df) - 1):
        solve_vals = []

        for j in range (num):
            solve = df.iloc[i - j]
            solve_vals.append(simp(solve["Time"]))

        solve_vals = remv(solve_vals)
        solve_val = avg(solve_vals)

        
        times[int(solve["No."] + num - 1)] = float(solve_val)
        current_best = solve_val


    df = pd.DataFrame(
    list(times.items()),
    columns=["x", "y"]
)

    df = df.sort_values("x")

    st.line_chart(df, x="x", y="y", height="content")

    #st.write(times)

def main():
    st.title("Cubing Statistics")


    uploaded_file = st.file_uploader("Upload a CSV or Excel file", type=["csv", "xlsx"])

    if uploaded_file is not None:
        try:
            # Check file extension and read accordingly
            if uploaded_file.name.endswith('.csv'):
                df = pd.read_csv(uploaded_file)
            elif uploaded_file.name.endswith('.xlsx'):
                df = pd.read_excel(uploaded_file)

            # Display the dataframe
            st.write("Uploaded Data:")
            st.dataframe(df)
        except Exception as e:
            st.error(f"Error reading file: {e}")
    else:
        st.warning("Please upload a CSV or Excel file.")

    with st.expander("Show Bests"):
        best_time(df)
        best_avg(df, 5)
        best_avg(df, 12)
        best_avg(df, 100)

    with st.expander("Show All"):
        all_avg(df, 5)
        all_avg(df, 12)
        all_avg(df, 100)


    





if __name__ == "__main__":
    main()